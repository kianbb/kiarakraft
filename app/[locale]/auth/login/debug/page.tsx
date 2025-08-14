export default function LoginDebugPage() {
  return (
    <div style={{
      minHeight: '100vh',
      padding: '20px',
      fontFamily: 'monospace',
      fontSize: '14px',
      backgroundColor: '#f5f5f5',
      color: '#333'
    }}>
      <h1 style={{ color: '#e11d48', fontSize: '24px', marginBottom: '20px' }}>
        🐛 DEBUG PAGE WORKING
      </h1>
      
      <div style={{
        backgroundColor: '#10b981',
        color: 'white',
        padding: '20px',
        borderRadius: '8px',
        marginBottom: '20px',
        fontSize: '16px'
      }}>
        ✅ SUCCESS: This debug page is now working! The issue was that it needed to be rebuilt/deployed.
      </div>

      <div style={{
        backgroundColor: 'white',
        padding: '20px',
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        marginBottom: '20px'
      }}>
        <h3 style={{ color: '#7c3aed', marginBottom: '10px' }}>🔍 What We Learned:</h3>
        <ul style={{ paddingLeft: '20px' }}>
          <li><strong>Main login page works:</strong> Server-side rendering and React components are functioning</li>
          <li><strong>Debug page was blank:</strong> Needed deployment/build to be accessible</li>
          <li><strong>Static HTML was blank:</strong> Was in wrong directory (moved to /public)</li>
        </ul>
      </div>

      <div style={{
        backgroundColor: '#fef3c7',
        padding: '15px',
        borderRadius: '8px',
        marginBottom: '20px'
      }}>
        <h3 style={{ color: '#92400e', margin: '0 0 10px 0' }}>✨ Next Steps:</h3>
        <ol style={{ color: '#92400e', paddingLeft: '20px', margin: 0 }}>
          <li>Now try: <a href="/fa/auth/login" style={{ color: '#3b82f6' }}>https://www.kiarakraft.com/fa/auth/login</a></li>
          <li>And try: <a href="/static-test.html" style={{ color: '#3b82f6' }}>https://www.kiarakraft.com/static-test.html</a></li>
          <li>If both work, the blank page issue should be resolved!</li>
        </ol>
      </div>

      <div style={{
        backgroundColor: 'white',
        padding: '20px',
        borderRadius: '8px',
        border: '2px solid #22c55e'
      }}>
        <p style={{ margin: 0, color: '#15803d', fontSize: '16px', textAlign: 'center' }}>
          🎉 Debug page is now working! Please test the login page again.
        </p>
      </div>
    </div>
  );
}