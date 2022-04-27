#!/usr/bin/env python3

"""
	Cockpit Samba Manager - Cockpit plugin for managing Samba.
	Copyright (C) 2021 Josh Boudreau <jboudreau@45drives.com>

	This file is part of Cockpit Samba Manager.
	Cockpit Samba Manager is free software: you can redistribute it and/or modify
	it under the terms of the GNU General Public License as published by
	the Free Software Foundation, either version 3 of the License, or
	(at your option) any later version.
	Cockpit Samba Manager is distributed in the hope that it will be useful,
	but WITHOUT ANY WARRANTY; without even the implied warranty of
	MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
	GNU General Public License for more details.
	You should have received a copy of the GNU General Public License
	along with Cockpit Samba Manager.  If not, see <https://www.gnu.org/licenses/>.
"""

import sys
import json
import subprocess

settings = json.loads(sys.stdin.read())

section = settings["section"]

for parm in settings["parms"].keys():
	parm_real_name = parm.replace("-", " ")
	try:
		child = subprocess.Popen(["net", "conf", "setparm", section, parm_real_name, settings["parms"][parm]], stdout=subprocess.PIPE)
	except OSError:
		print("Error executing net conf setparm, is it installed?")
		sys.exit(1)
	out, err = child.communicate()
	if(child.wait() != 0):
		print(err)
		sys.exit(child.returncode)

sys.exit(0)
