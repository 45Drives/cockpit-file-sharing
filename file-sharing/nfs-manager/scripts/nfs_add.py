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
def write_exports(name, path, clients):
    try:
        clientsString = ""
        for client in clients :
            clientsString += " " + client['ip'] + "(" + client['permissions'] + ")"

        print(clientsString)
        print("Writing to /etc/exports.d/cockpit-file-sharing.exports")
        with open("/etc/exports.d/cockpit-file-sharing.exports", "a") as f:
            f.write('# Name: ' + name + '\n"' + path + '"' + clientsString + '\n')
    except Exception as err:
        print(err)
        sys.exit(1)

# Name: Edit Export
# Receives: Name, Path, Client in JSON format and export name to edit
# Does: Finds the export name to edit and then replaces old lines with new lines.
# The file is then re-written with the new lines.
# Returns: Nothing
def edit_export(name, path, clients, edit_export_name):
    try:
        clientsString = ""
        for client in clients :
            clientsString += " " + client['ip'] + "(" + client['permissions'] + ")"

        export_file = open("/etc/exports.d/cockpit-file-sharing.exports", "r")
        lines = export_file.readlines()
        export_file.close()

        for i in range(0, len(lines)):
            if edit_export_name in lines[i]:
                lines[i] =  '# Name: ' + name + '\n'
                i += 1
                lines[i] = '"' + path + '"' + clientsString + '\n'
                break

        with open("/etc/exports.d/cockpit-file-sharing.exports", "w") as f:
            for line in lines:
                f.write(line)

    except Exception as err:
        print(err)
        sys.exit(1)

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
def make_nfs(entry, edit_export_name=""):
    create_dir(entry['path'])
    if edit_export_name == "":
        write_exports(entry['name'], entry['path'], entry["clients"])
    else:
        edit_export(entry['name'], entry['path'], entry["clients"], edit_export_name)
    reset_config()
    print("Done! Please mount " + entry['path'] + " to your directory of choosing on your own system!")
    print("sudo mount <host-ip>:" + entry['path'] + " <path to dir>")

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
    
    if len(lines) == 0 or lines[0] != "# Formmated by cockpit-file-sharing\n":
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
    parser.add_option("--edit", dest='edit', help="Add a name of an export to edit");
    (options, args) = parser.parse_args()
    
    if len(args) < 1:
        print("Please enter an export in JSON format.")
        sys.exit(1)

    entry = json.loads(args[0])

    if options.edit:
        make_nfs(entry, options.edit)
    else:
        make_nfs(entry)

if __name__ == "__main__":
    main()
    sys.exit(0)