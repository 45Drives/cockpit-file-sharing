Name: ::package_name::
Version: ::package_version::
Release: ::package_build_version::%{?dist}
Summary: ::package_description_short::
License: ::package_licence::
URL: ::package_url::
Source0: %{name}-%{version}.tar.gz
BuildArch: ::package_architecture_el::
Requires: ::package_dependencies_el_el8::

BuildRoot: %{_tmppath}/%{name}-%{version}-%{release}-root

%description
::package_title::
::package_description_long::

%prep
%setup -q

%build
make OS_PACKAGE_RELEASE=el8

%install
make DESTDIR=%{buildroot} install

%files
/usr/share/cockpit/file-sharing/*

%changelog
* Tue Feb 25 2025 Jordan Keough <jkeough@45drives.com> 4.2.9-2
- Updates Build Number + Changes user-defined iscsi config path to a static/default
  path, adds enable + config commands after saving targets to ensure config loads
  on reboot
* Tue Feb 25 2025 Jordan Keough <jkeough@45drives.com> 4.2.9-1
- Changes user-defined iscsi config path to a static/default path, adds enable +
  config commands after saving targets to ensure config loads on reboot
* Tue Nov 26 2024 Joshua Boudreau <jboudreau@45drives.com> 4.2.8-1
- Merge AutoAddRBDs_MinorFixes
* Mon Nov 25 2024 Joshua Boudreau <jboudreau@45drives.com> 4.2.7-1
- Fix missing global configuration when [global] missing from net conf registry
* Fri Nov 15 2024 Joshua Boudreau <jboudreau@45drives.com> 4.2.6-1
- Fix bug where only first instance of "include = " was inspected while looking for "include = registry"
- Harden getting list of clustered servers
* Thu Oct 31 2024 Josh Boudreau <jboudreau@45drives.com> 4.2.5-2
- iscsi release
* Mon Oct 28 2024 Brandon Kelly <brkelly@45drives.com> 4.2.5-1
- iSCSI Release
* Mon Sep 23 2024 Brandon Kelly <brkelly@45drives.com> 4.2.4-1
- Removed standalone RBD creation to use LVs instead
* Thu Sep 19 2024 Brandon Kelly <brkelly@45drives.com> 4.2.3-1
- Added more validations
* Wed Sep 18 2024 Brandon Kelly <brkelly@45drives.com> 4.2.2-1
- Refactored iSCSI Clustered integration
* Thu Jul 25 2024 Brandon Kelly <brkelly@45drives.com> 4.2.1-1
- Fixes to iSCSI Tab
* Thu Jul 25 2024 Brandon Kelly <brkelly@45drives.com> 4.2.0-1
- Fixes to iSCSI Tab
* Mon Jun 24 2024 Joshua Boudreau <jboudreau@45drives.com> 4.1.0-1
- Add iSCSI tab
* Fri Jun 14 2024 Joshua Boudreau <jboudreau@45drives.com> 4.0.3-1
- New Samba shares now default to read only = no
* Tue Jun 11 2024 Joshua Boudreau <jboudreau@45drives.com> 4.0.2-1
- Fixed error spamming when path does not exist for Ceph path settings
* Tue Jun 11 2024 Joshua Boudreau <jboudreau@45drives.com> 4.0.1-1
- Assign UUID FSID option for new NFS exports
- Add input validation for NFS exports
* Mon Jun 10 2024 Joshua Boudreau <jboudreau@45drives.com> 4.0.0-2
- fix table corners
* Mon Jun 10 2024 Joshua Boudreau <jboudreau@45drives.com> 4.0.0-1
- Complete rewrite for better maintainability and expansion
* Tue Apr 23 2024 Joshua Boudreau <jboudreau@45drives.com> 3.3.7-1
- Samba - fix saving global advanced settings with '=' in their value
- NFS - better whitespace handling while parsing exports file
* Wed Apr 03 2024 Joshua Boudreau <jboudreau@45drives.com> 3.3.6-1
- Fix import smb.conf modal overflow
* Tue Mar 12 2024 Joshua Boudreau <jboudreau@45drives.com> 3.3.5-1
- Workaround for Safari < 15.4 missing String.prototype.at()
* Fri Jun 02 2023 Dawson Della Valle <ddellavalle@45drives.com> 3.3.4-1
- Remove AD users from Edit Permissions modal
- Update Samba Audit parameters to conform with SnapShield requirements
* Fri Mar 24 2023 Dawson Della Valle <ddellavalle@45drives.com> 3.3.2-1
- Add Ceph + NFS support
- Add NFS config propagation aligning with corosync cluster hosts
* Fri Jan 06 2023 Josh Boudreau <jboudreau@45drives.com> 3.3.0-1
- Add Ceph settings to the NFS tab
- Propagate remount units across corosync cluster
* Fri Oct 28 2022 Joshua Boudreau <jboudreau@45drives.com> 3.2.9-2
- add gawk as dependency
* Thu Oct 27 2022 Joshua Boudreau <jboudreau@45drives.com> 3.2.9-1
- Optimize getting users and groups from AD/domain
- Add second Windows ACLs option for Linux/Mac clients
* Mon Sep 12 2022 Joshua Boudreau <jboudreau@45drives.com> 3.2.8-1
- Handle case where NFS exports.d directory does not exist.
* Wed Aug 24 2022 Joshua Boudreau <jboudreau@45drives.com> 3.2.7-1
- Fix scrolling in Safari
* Wed Aug 24 2022 Joshua Boudreau <jboudreau@45drives.com> 3.2.6-1
- Support Safari by removing regex lookbehinds
* Fri Aug 19 2022 Joshua Boudreau <jboudreau@45drives.com> 3.2.5-1
- Added ability to create ZFS datasets when path DNE and is within ZFS mountpoint
- Fixed CSS styling of directory permission editor
* Thu Aug 18 2022 Joshua Boudreau <jboudreau@45drives.com> 3.2.4-1
- Add settings menu for configuring smb.conf and exports file locations
- Fix parsing "valid users" field for Samba shares
* Thu Aug 04 2022 Joshua Boudreau <jboudreau@45drives.com> 3.2.3-1
- Fixed issue saving NFS exports file when /etc/exports.d DNE
* Wed Jul 27 2022 Joshua Boudreau <jboudreau@45drives.com> 3.2.2-1
- Remove end of line comment in automatically inserted content of smb.conf
- Optimize getting users and groups from domain
* Wed Jul 20 2022 Joshua Boudreau <jboudreau@45drives.com> 3.2.1-1
- Fix bug where cockpit-ws kills session while querying too many groups with getent
* Wed Jul 06 2022 Joshua Boudreau <jboudreau@45drives.com> 3.2.0-1
- Add button to import configuration from /etc/samba/smb.conf, backup original smb.conf,
  and replace it to just include registry
* Mon Jun 27 2022 Joshua Boudreau <jboudreau@45drives.com> 3.1.12-1
- Try to get ceph layout pools with /etc/ceph/ceph.client.samba.keyring first
* Fri Jun 24 2022 Joshua Boudreau <jboudreau@45drives.com> 3.1.11-1
- Use fileDownload() and processOutputDownload() from cockpit-helpers for exporting
  configs
* Thu Jun 23 2022 Joshua Boudreau <jboudreau@45drives.com> 3.1.10-1
- Watch for newly added users, groups, and CTDB hosts and refresh lists automatically
  in NFS tab too
- Set cursor to `cursor: wait` while processing for user feedback
* Wed Jun 22 2022 Joshua Boudreau <jboudreau@45drives.com> 3.1.9-1
- Fixed getting users and groups from system and domain
* Mon Jun 20 2022 Joshua Boudreau <jboudreau@45drives.com> 3.1.8-1
- Remove realm and wbinfo dependencies by getting users and groups with `getent -s
  winbind -s sss -s ldap`
- Handle directory permissions by numeric ID rather than user/group name
- Fixed yet another regex bug in validating smb.conf
* Wed Jun 08 2022 Joshua Boudreau <jboudreau@45drives.com> 3.1.7-1
- Use systemdUnitEscape() from cockpit-helpers to escape mount unit name instead
  of unreliable regex replace
- Fix regular expressions used to check for and insert 'include = registry' in smb.conf
* Fri Jun 03 2022 Joshua Boudreau <jboudreau@45drives.com> 3.1.6-1
- Fixed bug where regex would crash from too much recursion while parsing Ubuntu
  default smb.conf
- Watch for newly added users, groups, and CTDB hosts and refresh lists automatically
* Wed Jun 01 2022 Joshua Boudreau <jboudreau@45drives.com> 3.1.5-1
- Tweak input width to be full width for mobile
* Wed Jun 01 2022 Joshua Boudreau <jboudreau@45drives.com> 3.1.4-1
- Tweak styling of components
- Fix bug where Ceph remount tries to apply when directory DNE
* Thu May 19 2022 Joshua Boudreau <jboudreau@45drives.com> 3.1.3-2
- Add dependencies for packaging
* Thu May 19 2022 Joshua Boudreau <jboudreau@45drives.com> 3.1.3-1
- fix typo in acl_xattr setting
* Tue May 10 2022 Joshua Boudreau <jboudreau@45drives.com> 3.1.2-1
- Fixed canonicalizing Samba share path to fix bug with Ceph remount unit file name
- Canonicalize NFS share path
* Fri May 06 2022 Joshua Boudreau <jboudreau@45drives.com> 3.1.1-1
- Fix info button positioning
* Wed May 04 2022 Joshua Boudreau <jboudreau@45drives.com> 3.1.0-1
- Fix bugs with ceph remounting
- Add fix button for missing ceph remounts
- Clean up tab navigation
- Allow for disabling ceph remount
- Add plugin info button
- Automatically canonicalize share path on input change
* Thu Mar 24 2022 Joshua Boudreau <jboudreau@45drives.com> 3.0.1-1
- Fix some placeholder text, add tooltip for valid users
- Fix shadow copy settings for Ceph shares
- Clean up systemd mount files after deleting a Ceph share
* Wed Mar 23 2022 Joshua Boudreau <jboudreau@45drives.com> 3.0.0-1
- Overhaul Plugin with Vue.js and Tailwind CSS
* Tue Mar 08 2022 Brett Kelly <bkelly@45drives.com> 2.4.5-1
- add support for using samba varibles in path names
* Tue Mar 08 2022 Brett Kelly <bkelly@45drives.com> 2.4.5-1
- add support for using samba varibles in path names
* Mon Feb 14 2022 Brett Kelly <bkelly@45drives.com> 2.4.4-1
- added support for setting per share pool layout when using cephfs
* Mon Feb 14 2022 Brett Kelly <bkelly@45drives.com> 2.4.4-1
- added support for setting per share pool layout when using cephfs
* Mon Dec 13 2021 Joshua Boudreau <jboudreau@45drives.com> 2.4.3-1
- Use optional chaining operator while checking output on error in isCephSubDir()
* Mon Dec 13 2021 Joshua Boudreau <jboudreau@45drives.com> 2.4.3-1
- Use optional chaining operator while checking output on error in isCephSubDir()
* Fri Dec 10 2021 Joshua Boudreau <jboudreau@45drives.com> 2.4.2-1
- Use optional chaining operator while checking output on error in isCephFS()
* Fri Dec 10 2021 Joshua Boudreau <jboudreau@45drives.com> 2.4.2-1
- Use optional chaining operator while checking output on error in isCephFS()
* Mon Sep 27 2021 Brett Kelly <bkelly@45drives.com> 2.4.1-1
- change cephfs quotas after share creation
* Mon Sep 27 2021 Brett Kelly <bkelly@45drives.com> 2.4.1-1
- change cephfs quotas after share creation
* Tue Sep 21 2021 Brett Kelly <bkelly@45drives.com> 2.4.0-2
- improved error handling
* Tue Sep 21 2021 Brett Kelly <bkelly@45drives.com> 2.4.0-2
- improved error handling
* Mon Sep 20 2021 Brett Kelly <bkelly@45drives.com> 2.4.0-1
- rework cephfs mounts
* Mon Sep 20 2021 Brett Kelly <bkelly@45drives.com> 2.4.0-1
- rework cephfs mounts
* Mon Aug 23 2021 Sam Silver <ssilver@45drives.com> 2.3.1-1
- Fixed a bug where the 'set samba password' loader would not clear.
* Mon Aug 23 2021 Sam Silver <ssilver@45drives.com> 2.3.1-1
- Fixed a bug where the 'set samba password' loader would not clear.
* Wed Aug 18 2021 Sam Silver <ssilver@45drives.com> 2.3.0-1
- Changed how users are filtered
* Wed Aug 18 2021 Sam Silver <ssilver@45drives.com> 2.3.0-1
- Changed how users are filtered
* Tue Aug 17 2021 Sam Silver <ssilver@45drives.com> 2.2.1-1
- Added 'populate macos share' to single share settings as well as global settings
* Tue Aug 17 2021 Sam Silver <ssilver@45drives.com> 2.2.1-1
- Added 'populate macos share' to single share settings as well as global settings
* Tue Aug 17 2021 Sam Silver <ssilver@45drives.com> 2.2.0-1
- Added a 'populate macOS shares' setting in the Samba global config.
* Tue Aug 17 2021 Sam Silver <ssilver@45drives.com> 2.2.0-1
- Added a 'populate macOS shares' setting in the Samba global config.
* Wed Aug 11 2021 Sam Silver <ssilver@45drives.com> 2.1.0-1
- Added more error catching and better descriptions
* Wed Aug 11 2021 Sam Silver <ssilver@45drives.com> 2.1.0-1
- Added more error catching and better descriptions
* Wed Aug 11 2021 Sam Silver <ssilver@45drives.com> 2.0.2-1
- Fixed small bugs
* Wed Aug 11 2021 Sam Silver <ssilver@45drives.com> 2.0.2-1
- Fixed small bugs
* Wed Aug 11 2021 Sam Silver <ssilver@45drives.com> 2.0.1-1
- Fixed small bugs and typos.
* Wed Aug 11 2021 Sam Silver <ssilver@45drives.com> 2.0.1-1
- Fixed small bugs and typos.
* Wed Aug 11 2021 Sam Silver <ssilver@45drives.com> 2.0.0-1
- A code refactor and UI redesign of NFS Manager.
* Wed Aug 11 2021 Sam Silver <ssilver@45drives.com> 2.0.0-1
- A code refactor and UI redesign of NFS Manager.
* Mon Jul 05 2021 Sam Silver <ssilver@45drives.com> 1.0.0-1
- Initial packaging
