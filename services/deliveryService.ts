import { useState, useCallback, useEffect } from 'react';
import { Project, Task, Epic, Sprint } from '../types';
import { useOrganizationContext } from '../components/auth/OrganizationProvider';
import { deliveryAdapter } from './adapters/deliveryAdapter';
import { useAuth } from '../components/auth/AuthProvider';

export function useDeliveryService() {
  const { currentOrganization } = useOrganizationContext();
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchDeliveryData = useCallback(async () => {
    if (!currentOrganization) return;
    setLoading(true);
    try {
      const [projData, taskData] = await Promise.all([
        deliveryAdapter.getProjects(currentOrganization.id),
        deliveryAdapter.getTasks(currentOrganization.id)
      ]);
      setProjects(projData);
      setTasks(taskData);
    } catch (err) {
      console.error('Failed to fetch delivery data:', err);
    } finally {
      setLoading(false);
    }
  }, [currentOrganization]);

  useEffect(() => {
    fetchDeliveryData();
  }, [fetchDeliveryData]);

  const addTask = useCallback(async (task: Partial<Task>) => {
    if (!currentOrganization || !user) return;
    const saved = await deliveryAdapter.saveTask(task, currentOrganization.id, user.id);
    setTasks(prev => [...prev, saved]);
    return saved;
  }, [currentOrganization, user]);

  return {
    projects,
    tasks,
    loading,
    addTask,
    refresh: fetchDeliveryData
  };
}
