import sys
file_path = r"c:\Users\user1\Downloads\LOC\Locomotion\Locomotion\nginx\nginx.conf"

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Normalize line endings to avoid \r\n vs \n issues
content = content.replace('\r\n', '\n')

target = '        location /admin/ {'
replacement = '''        location /ws/ {
            set $web http://web:8000;
            proxy_pass $web;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $http_host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        location /admin/ {'''

if target in content and 'location /ws/' not in content:
    content = content.replace(target, replacement)
    # Write back with original or system line endings
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print('SUCCESS')
elif 'location /ws/' in content:
    print('ALREADY_EXISTS')
else:
    print('TARGET_NOT_FOUND')
