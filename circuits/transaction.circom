pragma circom 2.1.9;

include "node_modules/circomlib/circuits/poseidon.circom";
include "node_modules/circomlib/circuits/bitify.circom";
include "node_modules/circomlib/circuits/comparators.circom";
include "node_modules/circomlib/circuits/switcher.circom";

// Hagi vault transaction circuit.
// Adapted from the Tornado Nova transaction circuit (tornadocash/tornado-nova),
// extended so every note carries a token, and so a note can be completed on chain:
//
//   publicKey  = Poseidon(privateKey)
//   partial    = Poseidon(publicKey, blinding)
//   commitment = Poseidon(amount, token, partial)
//   signature  = Poseidon(privateKey, commitment, leafIndex)
//   nullifier  = Poseidon(commitment, leafIndex, signature)
//
// The vault can build a commitment from a public amount, a public token and a
// partial commitment, which is how shielding and swap outputs create notes.

template MerkleProof(levels) {
    signal input leaf;
    signal input pathElements[levels];
    signal input pathIndices;
    signal output root;

    component switcher[levels];
    component hasher[levels];
    component indexBits = Num2Bits(levels);
    indexBits.in <== pathIndices;

    for (var i = 0; i < levels; i++) {
        switcher[i] = Switcher();
        switcher[i].L <== i == 0 ? leaf : hasher[i - 1].out;
        switcher[i].R <== pathElements[i];
        switcher[i].sel <== indexBits.out[i];

        hasher[i] = Poseidon(2);
        hasher[i].inputs[0] <== switcher[i].outL;
        hasher[i].inputs[1] <== switcher[i].outR;
    }
    root <== hasher[levels - 1].out;
}

template Transaction(levels, nIns, nOuts) {
    // ---- public ----
    signal input root;
    signal input publicAmount;   // -(withdrawn amount + fee) mod p, or 0 for a private transfer
    signal input publicToken;    // the token leaving the vault, or 0 for a private transfer
    signal input extDataHash;    // binds recipient, fee, swap legs and encrypted notes
    signal input inputNullifier[nIns];
    signal input outputCommitment[nOuts];

    // ---- private ----
    signal input token;          // one token per transaction, hidden unless value leaves the vault
    signal input inAmount[nIns];
    signal input inPrivateKey[nIns];
    signal input inBlinding[nIns];
    signal input inPathIndices[nIns];
    signal input inPathElements[nIns][levels];
    signal input outAmount[nOuts];
    signal input outPubkey[nOuts];
    signal input outBlinding[nOuts];

    component inKeypair[nIns];
    component inPartial[nIns];
    component inCommitment[nIns];
    component inSignature[nIns];
    component inNullifier[nIns];
    component inTree[nIns];
    component inCheckRoot[nIns];
    var sumIns = 0;

    for (var tx = 0; tx < nIns; tx++) {
        inKeypair[tx] = Poseidon(1);
        inKeypair[tx].inputs[0] <== inPrivateKey[tx];

        inPartial[tx] = Poseidon(2);
        inPartial[tx].inputs[0] <== inKeypair[tx].out;
        inPartial[tx].inputs[1] <== inBlinding[tx];

        inCommitment[tx] = Poseidon(3);
        inCommitment[tx].inputs[0] <== inAmount[tx];
        inCommitment[tx].inputs[1] <== token;
        inCommitment[tx].inputs[2] <== inPartial[tx].out;

        inSignature[tx] = Poseidon(3);
        inSignature[tx].inputs[0] <== inPrivateKey[tx];
        inSignature[tx].inputs[1] <== inCommitment[tx].out;
        inSignature[tx].inputs[2] <== inPathIndices[tx];

        inNullifier[tx] = Poseidon(3);
        inNullifier[tx].inputs[0] <== inCommitment[tx].out;
        inNullifier[tx].inputs[1] <== inPathIndices[tx];
        inNullifier[tx].inputs[2] <== inSignature[tx].out;
        inNullifier[tx].out === inputNullifier[tx];

        inTree[tx] = MerkleProof(levels);
        inTree[tx].leaf <== inCommitment[tx].out;
        inTree[tx].pathIndices <== inPathIndices[tx];
        for (var i = 0; i < levels; i++) {
            inTree[tx].pathElements[i] <== inPathElements[tx][i];
        }

        // A zero-amount input is a placeholder and does not need to exist in the tree.
        inCheckRoot[tx] = ForceEqualIfEnabled();
        inCheckRoot[tx].in[0] <== root;
        inCheckRoot[tx].in[1] <== inTree[tx].root;
        inCheckRoot[tx].enabled <== inAmount[tx];

        sumIns += inAmount[tx];
    }

    component outPartial[nOuts];
    component outCommitment[nOuts];
    component outAmountCheck[nOuts];
    var sumOuts = 0;

    for (var tx = 0; tx < nOuts; tx++) {
        outPartial[tx] = Poseidon(2);
        outPartial[tx].inputs[0] <== outPubkey[tx];
        outPartial[tx].inputs[1] <== outBlinding[tx];

        outCommitment[tx] = Poseidon(3);
        outCommitment[tx].inputs[0] <== outAmount[tx];
        outCommitment[tx].inputs[1] <== token;
        outCommitment[tx].inputs[2] <== outPartial[tx].out;
        outCommitment[tx].out === outputCommitment[tx];

        // Amounts fit in 248 bits, so sums cannot wrap around the field.
        outAmountCheck[tx] = Num2Bits(248);
        outAmountCheck[tx].in <== outAmount[tx];

        sumOuts += outAmount[tx];
    }

    // No nullifier may be used twice in one transaction.
    component sameNullifiers[nIns * (nIns - 1) / 2];
    var index = 0;
    for (var i = 0; i < nIns - 1; i++) {
        for (var j = i + 1; j < nIns; j++) {
            sameNullifiers[index] = IsEqual();
            sameNullifiers[index].in[0] <== inputNullifier[i];
            sameNullifiers[index].in[1] <== inputNullifier[j];
            sameNullifiers[index].out === 0;
            index++;
        }
    }

    // Value is conserved.
    sumIns + publicAmount === sumOuts;

    // If any value leaves the vault, it must be the token the notes hold.
    signal tokenDiff;
    tokenDiff <== token - publicToken;
    publicAmount * tokenDiff === 0;

    // Tie the proof to the external data so it cannot be altered in transit.
    signal extDataSquare;
    extDataSquare <== extDataHash * extDataHash;
}

component main {public [root, publicAmount, publicToken, extDataHash, inputNullifier, outputCommitment]} = Transaction(20, 2, 2);
