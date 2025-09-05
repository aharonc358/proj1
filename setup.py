#!/usr/bin/env python3
"""
Setup script for the Python version of the Mini Chat + Polls app.
This script helps with environment setup and initial testing.
"""
import os
import sys
import subprocess
import platform
import webbrowser
import time
import argparse


def check_python_version():
    """Check if Python version is 3.9 or higher"""
    if sys.version_info < (3, 9):
        print("Error: This project requires Python 3.9 or higher")
        print(f"Current Python version: {platform.python_version()}")
        return False
    return True


def create_venv():
    """Create a virtual environment if it doesn't exist"""
    if not os.path.exists('venv'):
        print("Creating virtual environment...")
        subprocess.run([sys.executable, '-m', 'venv', 'venv'])
        print("Virtual environment created")
    else:
        print("Virtual environment already exists")
    
    return True


def install_requirements():
    """Install required packages"""
    # Determine the correct pip command based on platform
    if platform.system() == "Windows":
        pip_path = os.path.join("venv", "Scripts", "pip")
    else:
        pip_path = os.path.join("venv", "bin", "pip")
    
    print("Installing requirements...")
    subprocess.run([pip_path, 'install', '-r', 'requirements.txt'])
    print("Requirements installed")
    
    return True


def run_server():
    """Run the Flask server"""
    # Determine the correct python command based on platform
    if platform.system() == "Windows":
        python_path = os.path.join("venv", "Scripts", "python")
    else:
        python_path = os.path.join("venv", "bin", "python")
    
    print("Starting server at http://localhost:3001")
    
    # Open browser after a delay
    def open_browser():
        time.sleep(2)  # Wait for server to start
        webbrowser.open('http://localhost:3001')
    
    # Start browser in a separate thread
    import threading
    browser_thread = threading.Thread(target=open_browser)
    browser_thread.daemon = True
    browser_thread.start()
    
    # Run server (this will block until server stops)
    subprocess.run([python_path, 'app.py'])


def main():
    """Main function"""
    parser = argparse.ArgumentParser(description='Setup and run the Python Mini Chat app')
    parser.add_argument('--no-browser', action='store_true', help='Do not open browser automatically')
    parser.add_argument('--setup-only', action='store_true', help='Only setup environment, do not run server')
    
    args = parser.parse_args()
    
    # Check Python version
    if not check_python_version():
        return
    
    # Create virtual environment
    if not create_venv():
        return
    
    # Install requirements
    if not install_requirements():
        return
    
    # Run server if not setup only
    if not args.setup_only:
        run_server()


if __name__ == "__main__":
    main()
