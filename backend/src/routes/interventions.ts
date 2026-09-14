import express from 'express';
import { randomUUID } from 'crypto';
import { dbStore, UserRole, Intervention } from '../db';
import { getAuthUser } from '../auth';

export function registerInterventionRoutes(app: express.Express) {
  app.post('/api/interventions', async (req, res) => {
    const user = getAuthUser(req);
    if (!user || user.role !== UserRole.TEACHER) {
      return res.status(403).json({ error: 'Only teachers can record interventions.' });
    }
    const { studentId, weakCompetencies, strategyType, strategyDescription, duration, startDate } = req.body;
    if (!studentId || !weakCompetencies?.length || !strategyType || !strategyDescription) {
      return res.status(400).json({ error: 'Missing required fields.' });
    }
    const students = await dbStore.getStudents();
    const student = students.find(s => s.id === studentId);
    if (!student) return res.status(404).json({ error: 'Student not found.' });

    const intervention: Intervention = {
      id: 'int_' + randomUUID().slice(0, 8),
      studentId,
      studentName: student.name,
      teacherId: user.id,
      teacherName: user.name,
      schoolId: user.schoolId || student.schoolId,
      classId: student.classGroup,
      className: student.classGroup,
      section: student.section,
      weakCompetencies,
      currentLevel: student.currentLevel,
      strategyType,
      strategyDescription,
      duration: duration || '2 weeks',
      startDate: startDate || new Date().toISOString().split('T')[0],
      status: 'active',
      createdAt: new Date().toISOString()
    };
    await dbStore.addIntervention(intervention);
    await dbStore.addLog({
      id: 'log_' + randomUUID().slice(0, 8),
      timestamp: new Date().toISOString(),
      schoolId: user.schoolId || '',
      schoolName: '',
      userId: user.id,
      userEmail: user.email,
      userRole: user.role,
      activityType: 'verify',
      status: 'Success',
      details: `INTERVENTION: Recorded remedial intervention for ${student.name} — Strategy: ${strategyType}`
    });
    res.json(intervention);
  });

  // List interventions (role-scoped)
  app.get('/api/interventions', async (req, res) => {
    const user = getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    let interventions = await dbStore.getInterventions();

    if (user.role === UserRole.TEACHER) {
      interventions = interventions.filter(i => i.teacherId === user.id);
    } else if (user.role === UserRole.SCHOOL) {
      interventions = interventions.filter(i => i.schoolId === user.schoolId);
    } else if (user.role === UserRole.VOLUNTEER) {
      const assignedSchools = user.assignedSchools || [];
      interventions = interventions.filter(i => assignedSchools.includes(i.schoolId));
    } else if (user.role === UserRole.BLOCK_ADMIN) {
      const schools = await dbStore.getSchools();
      const blockSchools = schools.filter(s => s.blockCode === user.blockCode).map(s => s.id);
      interventions = interventions.filter(i => blockSchools.includes(i.schoolId));
    }
    // District Admin, Admin, Superadmin see all
    res.json(interventions);
  });

  // Get single intervention
  app.get('/api/interventions/:id', async (req, res) => {
    const user = getAuthUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    const interventions = await dbStore.getInterventions();
    const intervention = interventions.find(i => i.id === req.params.id);
    if (!intervention) return res.status(404).json({ error: 'Intervention not found.' });
    res.json(intervention);
  });


}
