export default function GlobalNotFound() {
  return (
    <div
      style={{
        fontFamily:
          'system-ui,"Segoe UI",Roboto,Helvetica,Arial,sans-serif,"Apple Color Emoji","Segoe UI Emoji"',
        height: '100vh',
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div className="hidden">NEXT_NOT_FOUND</div>
      <div>
        <style
          dangerouslySetInnerHTML={{
            __html: `body{color:#000;background:#fff;margin:0}.next-error-h1{border-right:1px solid rgba(0,0,0,.3)}@media (prefers-color-scheme:dark){body{color:#fff;background:#000}.next-error-h1{border-right:1px solid rgba(255,255,255,.3)}}`,
          }}
        />
        <h1
          className="next-error-h1"
          style={{
            display: 'inline-block',
            margin: '0 20px 0 0',
            padding: '0 23px 0 0',
            fontSize: 24,
            fontWeight: 500,
            verticalAlign: 'top',
            lineHeight: '49px',
          }}
        >
          404
        </h1>
        <div style={{ display: 'inline-block' }}>
          <h2
            style={{
              fontSize: 14,
              fontWeight: 400,
              lineHeight: '49px',
              margin: 0,
            }}
          >
            This page could not be found.
          </h2>
        </div>
      </div>
    </div>
  );
}
