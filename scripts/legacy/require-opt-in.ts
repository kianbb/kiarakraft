if (process.env.KIARA_ALLOW_LEGACY_SCRIPT !== '1') {
  console.error(
    'Legacy script blocked. Set KIARA_ALLOW_LEGACY_SCRIPT=1 to opt in.'
  );
  process.exit(1);
}
