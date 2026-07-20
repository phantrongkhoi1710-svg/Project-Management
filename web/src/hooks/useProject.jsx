import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { CANONICAL_SECTIONS } from '../lib/roles'
import { useAuth } from './useAuth'

const ProjectContext = createContext(null)
const STORAGE_KEY = 'pm_current_project_id'

export function ProjectProvider({ children }) {
  const { user, caps } = useAuth()
  const [projects, setProjects] = useState([])
  const [currentProject, setCurrentProject] = useState(null)
  const [sections, setSections] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const loadProjects = useCallback(async () => {
    setError('')
    const { data, error: err } = await supabase
      .from('projects')
      .select('id, name, ship_id, department, status, start_date, end_date, owner_id, ship_leader_id, created_at')
      .order('created_at', { ascending: false })
    if (err) {
      setError(err.message)
      setProjects([])
      return []
    }
    setProjects(data || [])
    return data || []
  }, [])

  const loadSections = useCallback(async (projectId) => {
    if (!projectId) {
      setSections([])
      return []
    }
    const { data, error: err } = await supabase
      .from('sections')
      .select('id, header_name, sort_order, project_id')
      .eq('project_id', projectId)
      .order('sort_order', { ascending: true })
    if (err) {
      setError(err.message)
      setSections([])
      return []
    }
    setSections(data || [])
    return data || []
  }, [])

  const selectProject = useCallback(
    async (project) => {
      setCurrentProject(project)
      if (project?.id) {
        localStorage.setItem(STORAGE_KEY, project.id)
        await loadSections(project.id)
      } else {
        localStorage.removeItem(STORAGE_KEY)
        setSections([])
      }
    },
    [loadSections]
  )

  const createProject = useCallback(
    async ({ shipId, department = 'Piping', startDate, endDate }) => {
      if (!user || !caps.canCreateProject) {
        throw new Error('Bạn không có quyền tạo project.')
      }
      const ship = String(shipId || '').trim()
      if (!ship) throw new Error('Ship ID bắt buộc.')

      const { data: project, error: createErr } = await supabase
        .from('projects')
        .insert({
          name: ship,
          ship_id: ship,
          department,
          start_date: startDate || null,
          end_date: endDate || null,
          status: 'In Progress',
          owner_id: user.id,
        })
        .select('*')
        .single()

      if (createErr) throw createErr

      const { error: memberErr } = await supabase.from('project_members').insert({
        project_id: project.id,
        user_id: user.id,
        role: 'owner',
      })
      if (memberErr) throw memberErr

      const sectionRows = CANONICAL_SECTIONS.map((header_name, sort_order) => ({
        project_id: project.id,
        header_name,
        sort_order,
      }))
      const { error: secErr } = await supabase.from('sections').insert(sectionRows)
      if (secErr) throw secErr

      await loadProjects()
      await selectProject(project)
      return project
    },
    [user, caps.canCreateProject, loadProjects, selectProject]
  )

  useEffect(() => {
    if (!user) {
      setProjects([])
      setCurrentProject(null)
      setSections([])
      return
    }
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const list = await loadProjects()
      if (cancelled) return
      const saved = localStorage.getItem(STORAGE_KEY)
      const found = list.find((p) => p.id === saved) || list[0] || null
      if (found) await selectProject(found)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [user, loadProjects, selectProject])

  const value = useMemo(
    () => ({
      projects,
      currentProject,
      sections,
      loading,
      error,
      loadProjects,
      selectProject,
      createProject,
      reloadSections: () => loadSections(currentProject?.id),
    }),
    [projects, currentProject, sections, loading, error, loadProjects, selectProject, createProject, loadSections]
  )

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>
}

export function useProject() {
  const ctx = useContext(ProjectContext)
  if (!ctx) throw new Error('useProject must be used within ProjectProvider')
  return ctx
}
