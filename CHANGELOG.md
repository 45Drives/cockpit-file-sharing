## Cockpit File Sharing 3.1.7-1

* Use systemdUnitEscape() from cockpit-helpers to escape mount unit name instead of unreliable regex replace
* Fix regular expressions used to check for and insert 'include = registry' in smb.conf