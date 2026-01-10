import React, { createContext, useContext, useState, useCallback } from 'react'

const BackgroundTaskContext = createContext()

export const useBackgroundTask = () => {
  const context = useContext(BackgroundTaskContext)
  if (!context) {
    throw new Error('useBackgroundTask must be used within a BackgroundTaskProvider')
  }
  return context
}

export const BackgroundTaskProvider = ({ children }) => {
  const [activeTasks, setActiveTasks] = useState([])

  /**
   * 백그라운드 작업 추가
   * @param {string} taskId - 작업 ID
   * @param {string} taskName - 작업 이름 (예: "명함 분석")
   */
  const addTask = useCallback((taskId, taskName) => {
    setActiveTasks(prev => {
      if (prev.find(t => t.id === taskId)) {
        return prev // 이미 존재하면 추가하지 않음
      }
      return [...prev, { id: taskId, name: taskName, startTime: Date.now() }]
    })
  }, [])

  /**
   * 백그라운드 작업 제거
   * @param {string} taskId - 작업 ID
   */
  const removeTask = useCallback((taskId) => {
    setActiveTasks(prev => prev.filter(t => t.id !== taskId))
  }, [])

  /**
   * 모든 작업 제거
   */
  const clearTasks = useCallback(() => {
    setActiveTasks([])
  }, [])

  /**
   * 활성 작업 수 확인
   */
  const hasActiveTasks = activeTasks.length > 0

  const value = {
    activeTasks,
    addTask,
    removeTask,
    clearTasks,
    hasActiveTasks,
    taskCount: activeTasks.length
  }

  return (
    <BackgroundTaskContext.Provider value={value}>
      {children}
    </BackgroundTaskContext.Provider>
  )
}
