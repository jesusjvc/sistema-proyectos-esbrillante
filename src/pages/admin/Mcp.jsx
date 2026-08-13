import Layout from '../../components/Layout'
import McpSetupGuide from '../../components/McpSetupGuide'

export default function Mcp() {
  return (
    <Layout titulo="Conectar Claude Code" volver="/admin">
      <McpSetupGuide />
    </Layout>
  )
}
