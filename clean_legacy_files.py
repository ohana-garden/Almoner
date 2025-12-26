import os
import shutil

def delete_path(path):
    if os.path.exists(path):
        if os.path.isdir(path):
            shutil.rmtree(path)
        else:
            os.remove(path)
        print(f"🗑️  Deleted: {path}")

# 1. Kala Engine (Time logic - we aren't using this yet)
delete_path("src/modules/kala-engine")

# 2. Old Data Ingestion logic (We are using the new stubbed engine for now)
delete_path("src/modules/data-ingestion/grants-gov-client.ts")
delete_path("src/modules/data-ingestion/irs990-parser.ts")
delete_path("src/modules/data-ingestion/scheduler.ts")
delete_path("src/modules/data-ingestion/xml-stream-parser.ts")

# 3. Old Capture module (Unused)
delete_path("src/modules/capture")

print("✨ Cleanup Complete. The build path is clear.")
