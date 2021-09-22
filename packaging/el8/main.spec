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

%install
make DESTDIR=%{buildroot} install

%files
/usr/share/cockpit/file-sharing/*

%changelog
* Wed Sep 22 2021 Brett Kelly <bkelly@45drives.com> 2.4.0-3
- Reworked how cephfs shares are created to allow quotas to appears correctly when
  mounting samba in windows
- Allows for cephfs quotas to be set from file-sharing module without going to the
  ceph dashboard or terminal
- Removed error message and need for second click when adding a new directory
- Fixed Typo when populating ceph_snapshots vfs object
* Wed Sep 22 2021 Brett Kelly <bkelly@45drives.com> 2.4.0-3
- Reworked how cephfs shares are created to allow quotas to appears correctly when
  mounting samba in windows
- Allows for cephfs quotas to be set from file-sharing module without going to the
  ceph dashboard or terminal
- Removed error message and need for second click when adding a new directory
- Fixed Typo when populating ceph_snapshots vfs object
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