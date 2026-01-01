import os

# Definition of the first 5 "Founding Fathers" of your community
founding_agents = [
    {
        "name": "Security_Auditor",
        "specialty": "Railway cost monitoring and secret protection",
        "prompt": "You are the Guardian. Monitor instrument creation for API key leaks and Railway credit usage."
    },
    {
        "name": "The_Librarian",
        "specialty": "Graphiti maintenance and instrument indexing",
        "prompt": "You are the Cataloger. Your goal is to ensure no two instruments perform the same task."
    },
    {
        "name": "Polyglot_Coder",
        "specialty": "Writing server-side instruments in Python, Go, and JS",
        "prompt": "You are the Artisan. You write clean, stateless server-side functions for the /instruments folder."
    },
    {
        "name": "Temporal_Researcher",
        "specialty": "Web-search and real-time data ingestion",
        "prompt": "You are the Scout. You find current data and provide it to the Architect for long-term storage."
    }
]

def seed():
    print("🚀 Initializing Founding Agents...")
    for agent in founding_agents:
        # We tell A0 to run the instrument we just built
        print(f"Summoning A0 to register {agent['name']}...")
        # (In your codespace terminal, you would run 'railway run' or use the A0 UI)
        
if __name__ == "__main__":
    seed()
    