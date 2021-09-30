## Cockpit File Sharing 2.4.0-3

* Reworked how cephfs shares are created to allow quotas to appears correctly when mounting samba in windows
* Allows for cephfs quotas to be set from file-sharing module without going to the ceph dashboard or terminal
* Removed error message and need for second click when adding a new directory
* Fixed Typo when populating ceph_snapshots vfs object
## Cockpit File Sharing 2.4.1-1

* change cephfs quotas after share creation
