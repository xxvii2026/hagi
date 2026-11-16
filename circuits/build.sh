#!/usr/bin/env bash
# Compiles the circuit and runs a single-party Groth16 setup.
# TESTNET ONLY: one contributor means the setup is not trustworthy for real funds.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p build
npx circom2 transaction.circom --r1cs --wasm --sym -o build
npx snarkjs r1cs info build/transaction.r1cs
POWER=${PTAU_POWER:-15}
if [ ! -f build/pot_final.ptau ]; then
  npx snarkjs powersoftau new bn128 "$POWER" build/pot_0.ptau
  npx snarkjs powersoftau contribute build/pot_0.ptau build/pot_1.ptau --name="hagi testnet" -e="hagi testnet dev entropy $(date +%s%N)"
  npx snarkjs powersoftau prepare phase2 build/pot_1.ptau build/pot_final.ptau
  rm -f build/pot_0.ptau build/pot_1.ptau
fi
npx snarkjs groth16 setup build/transaction.r1cs build/pot_final.ptau build/tx_0.zkey
npx snarkjs zkey contribute build/tx_0.zkey build/transaction.zkey --name="hagi testnet" -e="hagi testnet zkey entropy $(date +%s%N)"
rm -f build/tx_0.zkey
npx snarkjs zkey export verificationkey build/transaction.zkey build/verification_key.json
npx snarkjs zkey export solidityverifier build/transaction.zkey ../contracts/src/Verifier.sol
mkdir -p ../public/zk
cp build/transaction_js/transaction.wasm ../public/zk/transaction.wasm
cp build/transaction.zkey ../public/zk/transaction.zkey
cp build/verification_key.json ../public/zk/verification_key.json
ls -la ../public/zk
