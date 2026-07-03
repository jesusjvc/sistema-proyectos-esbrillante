import { createContext, useContext, useState, useEffect } from 'react'
import { getMe, logout as apiLogout } from '../data/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  // undefined = cargando, null = no autenticado, objeto = usuario
  const [user, setUser] = useState(undefined)

  useEffect(() => {
    getMe()
      .then((data) => setUser({ ...data, rol: data.rol.toLowerCase() }))
      .catch(() => setUser(null))
  }, [])

  async function logout() {
    await apiLogout().catch(() => {})
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, setUser, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
