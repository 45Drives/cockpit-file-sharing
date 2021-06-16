Name:           ::package_name::
Version:        ::package_version::
Release:        ::package_build_version::%{?dist}
Summary:        ::package_description_short::
License:        ::package_license::
URL:            ::package_url::
Source0:        %{name}-%{version}.tar.gz
BuildArch:      ::package_rpm_architecture::
Requires:       ::package_rpm_dependencies::

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
* Wed Jun 16 2021 Sam Silver <ssilver@45drives.com> 1.0.0-1
- Initial packaging
- Cockpit module that makes managing file shares easy