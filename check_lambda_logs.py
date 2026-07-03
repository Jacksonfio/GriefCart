import json, subprocess, sys

functions = [
    "griefcart-dev-trusted-api",
    "griefcart-dev-score-api",
    "griefcart-dev-twin-api",
    "griefcart-dev-chat-api",
    "griefcart-dev-detective-api",
    "griefcart-dev-recovery-api",
    "griefcart-dev-plan-api",
    "griefcart-dev-documents-api",
]

for fn in functions:
    print(f"\n=== {fn} ===")
    cmd = ["aws", "logs", "describe-log-streams", "--log-group-name", f"/aws/lambda/{fn}", "--order-by", "LastEventTime", "--descending", "--limit", "1", "--query", "logStreams[0].logStreamName", "--output", "text"]
    result = subprocess.run(cmd, capture_output=True, text=True)
    stream = result.stdout.strip()
    if not stream or "error" in result.stderr.lower():
        print(f"  No log stream found")
        continue
    
    cmd2 = ["aws", "logs", "get-log-events", "--log-group-name", f"/aws/lambda/{fn}", "--log-stream-name", stream, "--output", "json"]
    result2 = subprocess.run(cmd2, capture_output=True, text=True)
    try:
        data = json.loads(result2.stdout)
        messages = [e["message"] for e in data.get("events", [])]
        # Find error messages (NOT START/END/REPORT/INIT)
        errors = [m for m in messages if not m.startswith("START") and not m.startswith("END") and not m.startswith("REPORT") and not m.startswith("INIT")]
        if errors:
            for e in errors[-10:]:
                print(f"  {e[:200]}")
        else:
            # Print all messages if no errors found
            for m in messages[-3:]:
                print(f"  {m[:200]}")
    except Exception as ex:
        print(f"  Error parsing logs: {ex}")
