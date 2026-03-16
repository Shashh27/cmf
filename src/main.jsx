import { createRoot } from 'react-dom/client'
import { ConfigProvider, App as AntApp } from 'antd'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <ConfigProvider
    theme={{
      token: {
        fontFamily: "'Inter', system-ui, sans-serif",
        fontSize: 13,
      },
    }}
  >
    <AntApp>
      <App />
    </AntApp>
  </ConfigProvider>,
)
