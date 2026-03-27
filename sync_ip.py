import socket
import os
import re

def get_local_ip():
    """Detects the current local IP address by connecting to a public DNS server."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        # doesn't even have to be reachable
        s.connect(('8.8.8.8', 1))
        IP = s.getsockname()[0]
    except Exception:
        IP = '127.0.0.1'
    finally:
        s.close()
    return IP

def update_file(file_path, pattern, replacement):
    if not os.path.exists(file_path):
        print(f"Warning: File not found - {file_path}")
        return False
    
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    new_content = re.sub(pattern, replacement, content)
    
    if content == new_content:
        print(f"No changes needed for {os.path.basename(file_path)}")
        return False
    
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(new_content)
    
    print(f"Updated {os.path.basename(file_path)}")
    return True

def main():
    new_ip = get_local_ip()
    print(f"Detected IP: {new_ip}")
    
    if new_ip == '127.0.0.1':
        print("Error: Could not detect a valid local IP. Please check your WiFi connection.")
        return

    # 1. Django Settings
    settings_path = r"c:\Users\user1\Desktop\L\Locomotion\Locomotion\Locomotion\settings.py"
    # Matches http://192.168.x.x:5173
    update_file(settings_path, r"http://\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}", f"http://{new_ip}")
    
    # 2. React .env
    env_path = r"c:\Users\user1\Desktop\L\Locomotion React\Locomotion React\.env"
    # Matches http://192.168.x.x
    update_file(env_path, r"http://\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}", f"http://{new_ip}")
    
    # 3. Mobile Config.js
    mobile_config_path = r"c:\Users\user1\Desktop\L\LocomotionMobile\constants\Config.js"
    # Matches http://192.168.x.x
    update_file(mobile_config_path, r"http://\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}", f"http://{new_ip}")

    print("\nAll files synchronized! Remember to RESTART your servers if needed.")

if __name__ == "__main__":
    main()
