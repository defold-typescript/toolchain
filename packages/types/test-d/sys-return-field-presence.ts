/// <reference path="../index.d.ts" />

// Upstream gates these four fields on a platform, so reading one without a
// presence check is unsound; the siblings are documented unconditionally.
const _info = sys.get_sys_info();

const _systemName: string = _info.system_name;
const _gmtOffset: number = _info.gmt_offset;

// @ts-expect-error device_model is only present on iOS and Android
const _deviceModel: string = _info.device_model;
// @ts-expect-error manufacturer is only present on iOS and Android
const _manufacturer: string = _info.manufacturer;
// @ts-expect-error device_ident is only present on iOS and Android
const _deviceIdent: string = _info.device_ident;
// @ts-expect-error user_agent is only present on HTML5
const _userAgent: string = _info.user_agent;

const _checkedModel: string = _info.device_model ?? "unknown";

// `noUncheckedIndexedAccess` makes the index itself possibly-undefined, so the
// proof narrows past the index and asserts the field, not the lookup.
const _ifaddrs = sys.get_ifaddrs();
const _first = _ifaddrs[0];
if (_first !== undefined) {
  const _name: string = _first.name;
  const _up: boolean = _first.up;

  // @ts-expect-error address might be nil if not available
  const _address: string = _first.address;
  // @ts-expect-error mac might be nil if not available
  const _mac: string = _first.mac;

  const _checkedAddress: string = _first.address ?? "0.0.0.0";
  void _name;
  void _up;
  void _address;
  void _mac;
  void _checkedAddress;
}

void _systemName;
void _gmtOffset;
void _deviceModel;
void _manufacturer;
void _deviceIdent;
void _userAgent;
void _checkedModel;
