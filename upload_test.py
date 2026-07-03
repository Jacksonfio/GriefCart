import json, subprocess, urllib.request, urllib.error, base64

cmd = 'aws cognito-idp initiate-auth --client-id 61ho55j2698boup2aq6j5gkhel --auth-flow USER_PASSWORD_AUTH --auth-parameters USERNAME=Jacksonfio,PASSWORD="Jacksonfio@942"'
result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
resp = json.loads(result.stdout)
id_token = resp['AuthenticationResult']['IdToken']

# Create a small test PDF
pdf_data = '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R>>endobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n190\n%%EOF'
pdf_b64 = base64.b64encode(pdf_data.encode()).decode()

body = json.dumps({'fileName': 'test.pdf', 'contentType': 'application/pdf', 'category': 'test', 'fileData': pdf_b64})
url = 'https://g6d96iexi0.execute-api.us-east-1.amazonaws.com/v1/documents/upload'

req = urllib.request.Request(url, data=body.encode(), headers={'Content-Type': 'application/json', 'Authorization': 'Bearer ' + id_token})
try:
    resp = urllib.request.urlopen(req)
    print('Upload response:', resp.status)
    print(resp.read().decode())
except urllib.error.HTTPError as e:
    print('Upload error:', e.code, e.read().decode())
except Exception as e:
    print('Error:', e)
