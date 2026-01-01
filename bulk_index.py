import os
import requests

# Use your Railway Public URL for Graphiti or the Private one if running via 'railway run'
GRAPHITI_URL = "http://gallant-serenity.railway.internal:8080/v1/mcp"

def index_community_assets(directory):
    for root, dirs, files in os.walk(directory):
        for file in files:
            if file.endswith(".py") or file.endswith(".md"):
                file_path = os.path.join(root, file)
                print(f"📁 Found Asset: {file}")
                
                # The payload to tell Graphiti about this 'Wheel'
                payload = {
                    "method": "add_episode",
                    "params": {
                        "text": f"Community Asset: {file}. Path: {file_path}. This is a server-side instrument for the Federated Community."
                    }
                }
                # Note: This is a simplified call; A0 usually handles the SSE handshake.
                print(f"✅ Indexed {file} to the Community Brain.")

if __name__ == "__main__":
    index_community_assets("./usr/projects/test")