#!/bin/bash
set -e

echo "🔍 VERIFICATION REPORT"
echo "======================"

# 1. Check File Content
echo "1. Checking file content..."
if grep -q "hash the title +able ID" src/modules/entity-resolution/index.ts; then
  echo "❌ FAIL: The garbled text is still in the file!"
  exit 1
else
  echo "✅ PASS: Garbled text removed."
fi

if grep -q "STRATEGY 2: Derived Composite ID" src/modules/entity-resolution/index.ts; then
  echo "✅ PASS: New logic found."
else
  echo "❌ FAIL: New logic missing."
  exit 1
fi

# 2. Check Compilation
echo "----------------------"
echo "2. Checking compilation..."
# We only compile this specific file to be fast
npx tsc src/modules/entity-resolution/index.ts --noEmit --esModuleInterop --skipLibCheck --target es2020 --moduleResolution node
if [ $? -eq 0 ]; then
  echo "✅ PASS: TypeScript syntax is valid."
else
  echo "❌ FAIL: Compilation errors found."
  exit 1
fi

echo "----------------------"
echo "🎉 VERIFICATION COMPLETE: The code is clean and valid."
