Name: ::package_name::
Version: ::package_version::
Release: ::package_build_version::%{?dist}
Summary: ::package_description_short::
License: ::package_licence::
URL: ::package_url::
Source0: %{name}-%{version}.tar.gz
BuildArch: ::package_architecture_el::
Requires: ::package_dependencies_el::

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