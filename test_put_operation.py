#!/usr/bin/env python3

import requests
import json

# Test PUT operation with HMS time format
url = "http://localhost:8000/operations/1"
headers = {"Content-Type": "application/json"}
data = {
    "operation_name": "drilling",
    "setup_time": "00:10:00",
    "cycle_time": "00:15:30"
}

print("Testing PUT operation with HMS time format...")
print(f"URL: {url}")
print(f"Data: {json.dumps(data, indent=2)}")

try:
    response = requests.put(url, headers=headers, json=data)
    print(f"\nStatus Code: {response.status_code}")
    
    if response.status_code == 200:
        print("✅ Success!")
        print("Response:")
        print(json.dumps(response.json(), indent=2, default=str))
    else:
        print(f"❌ Error: {response.status_code}")
        print("Response:")
        print(response.text)
        
except requests.exceptions.ConnectionError:
    print("❌ Connection Error: Make sure the FastAPI server is running on localhost:8000")
except Exception as e:
    print(f"❌ Error: {e}")
