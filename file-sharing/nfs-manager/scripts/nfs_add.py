#!/usr/bin/env python3

""" 
    Cockpit File Sharing - Cockpit plugin for managing file shares.
    Copyright (C) 2021 Sam Silver <ssilver@45drives.com>

    This file is part of Cockpit File Sharing.
    Cockpit File Sharing is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.
    Cockpit File Sharing is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.
    You should have received a copy of the GNU General Public License
    along with Cockpit File Sharing.  If not, see <https://www.gnu.org/licenses/>.  
"""

from os import name
import re
import json
import sys
import subprocess
from optparse import OptionParser

# Name: create_dir
# Receives: Path
# Does: Checks if directory exists, if not, create it.
# Returns: Nothing
def create_dir(path):
    print("Path: " + path)
    if subprocess.call(["stat", path], stdout=subprocess.PIPE, stderr=subprocess.PIPE) == 0:
        print("Directory already exist, using it...")
        return
    try:
        print("Creating directory:", path)
        subprocess.run(["mkdir", "-p", path])
    except OSError:
        print("Cannot make directory.")
        sys.exit(1)

# Name: write_exports
# Receives: Name, Path, Client IP and Options
# Does: Enters name, path and clients ip into exports config.
# Returns: Nothing
def write_exports(name, path, info):
    try:
        client_info = json.loads(info)
        clients = ""
        for index in range(0, len(client_info), 2):
            clients += " " + client_info[index] + "(" + client_info[index+1] + ")"

        print(clients)
        print("Writing to /etc/exports.d/cockpit-file-sharing.exports")
        with open("/etc/exports.d/cockpit-file-sharing.exports", "a") as f:
            f.write('# Name: ' + name + '\n"' + path + '"' + clients + '\n')
    except Exception as err:
        print(err)

# Name: reset_config
# Receives: Nothing
# Does: Export new shared directory as well as restart the nfs system.
# Returns: Nothing
def reset_config():
    try:
        subprocess.run(["exportfs", "-ra"], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        print("Restarting nfs...")
    except OSError:
        print("Could not restart nfs, do you have it on your system?")
        sys.exit(1)

# Name: make_nfs
# Receives: Name, Path, IP and Options
# Does: Runs all functions that launches certian commands to make nfs
# Returns: Nothing
def make_nfs(name, path, info):
    create_dir(path)
    write_exports(name, path, info)
    reset_config()
    print("Done! Please mount " + path + " to your directory of choosing on your own system!")
    print("sudo mount <host-ip>:" + path + " <path to dir>")

# Name: check_config
# Receives: Nothing
# Does: Checks in /etc/exports.d/cockpit-file-sharing.exports exists/ is in correct format.
# Returns: Nothing
def check_config():
    try:
        file = open("/etc/exports.d/cockpit-file-sharing.exports", "r")
        lines = file.readlines()
        file.close()
    except OSError:
        print("Could not open /etc/exports.d/cockpit-file-sharing.exports. Do you have nfs installed?")
        sys.exit(1)
    
    if len(lines) == 0 or lines[0] != "# Formmated for cockpit-nfs-manager\n":
        print("Please run nfs_list.py for setup.")
        sys.exit(1)

# Name: main
# Receives: nothing
# Does: Checks all the arguments and flags. Makes sure the user entered enough
# arguments. Chucks arguments into make_nfs function
# Returns: Nothing
def main():
    check_config()
    parser = OptionParser()
    (options, args) = parser.parse_args()
    if len(args) < 3:
        print("Not enough arguments!\nnfs_add <name> <path> <client-info-array>")
        sys.exit(1)
    make_nfs(args[0], args[1], args[2])

if __name__ == "__main__":
    main()
    sys.exit(0)