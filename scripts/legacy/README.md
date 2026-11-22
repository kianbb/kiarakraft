# Legacy maintenance scripts

These historical scripts must never be run as setup. They may write to whatever database the environment points at, and some call external providers or replace assets. The `KIARA_ALLOW_LEGACY_SCRIPT=1` opt-in grants no authorization and does not validate the target. Database resets remain disabled even with the opt-in.
