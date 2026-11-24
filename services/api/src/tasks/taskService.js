import { v4 as uuidv4 } from 'uuid';
import { query } from '../db/index.js';
import { createNotification } from '../notifications/notificationService.js';
import { getSocketServer } from '../websocket/index.js';

/**
 * Creates a new task.
 * - Parent can assign a task to their linked child.
 * - Student can propose a new task to their parent.
 */
export async function createTask({ user, studentId, title, description = '', subject = 'General' }) {
  if (!title || !title.trim()) {
    const err = new Error('Task title is required');
    err.statusCode = 400;
    throw err;
  }

  const id = uuidv4();
  const now = new Date().toISOString();
  const io = getSocketServer();

  if (user.role === 'PARENT') {
    if (!studentId) {
      const links = await query(
        `SELECT student_id FROM parent_student_links WHERE parent_id = $1 AND status = 'ACTIVE' LIMIT 1`,
        [user.id]
      );
      if (links.rows.length === 0) {
        const err = new Error('No child linked to parent yet. Pair a device first.');
        err.statusCode = 400;
        throw err;
      }
      studentId = links.rows[0].student_id;
    } else {
      const check = await query(
        `SELECT 1 FROM parent_student_links WHERE parent_id = $1 AND student_id = $2 AND status = 'ACTIVE'`,
        [user.id, studentId]
      );
      if (check.rows.length === 0) {
        const err = new Error('Unauthorized: Student is not linked to this parent.');
        err.statusCode = 403;
        throw err;
      }
    }

    await query(
      `INSERT INTO tasks (id, student_id, parent_id, created_by_role, title, description, subject, status, created_at, updated_at)
       VALUES ($1, $2, $3, 'PARENT', $4, $5, $6, 'APPROVED', $7, $7)`,
      [id, studentId, user.id, title.trim(), description.trim(), subject.trim(), now]
    );

    const task = {
      id,
      student_id: studentId,
      parent_id: user.id,
      created_by_role: 'PARENT',
      title: title.trim(),
      description: description.trim(),
      subject: subject.trim(),
      status: 'APPROVED',
      created_at: now,
    };

    if (io) {
      io.to(`user:${studentId}`).emit('task:assigned', {
        task,
        assignedBy: user.name,
      });
    }

    return task;
  } else {
    // STUDENT proposing a new task
    studentId = user.id;
    const parentLinks = await query(
      `SELECT parent_id FROM parent_student_links WHERE student_id = $1 AND status = 'ACTIVE'`,
      [user.id]
    );

    const parentId = parentLinks.rows.length > 0 ? parentLinks.rows[0].parent_id : null;

    await query(
      `INSERT INTO tasks (id, student_id, parent_id, created_by_role, title, description, subject, status, created_at, updated_at)
       VALUES ($1, $2, $3, 'STUDENT', $4, $5, $6, 'PENDING', $7, $7)`,
      [id, studentId, parentId, title.trim(), description.trim(), subject.trim(), now]
    );

    const task = {
      id,
      student_id: studentId,
      parent_id: parentId,
      created_by_role: 'STUDENT',
      title: title.trim(),
      description: description.trim(),
      subject: subject.trim(),
      status: 'PENDING',
      created_at: now,
    };

    if (io && parentLinks.rows.length > 0) {
      for (const { parent_id } of parentLinks.rows) {
        io.to(`parent:${parent_id}`).emit('task:proposed', {
          task,
          studentName: user.name,
        });

        await createNotification({
          recipientUserId: parent_id,
          type: 'TASK_PROPOSED',
          title: `📝 New Task Proposed by ${user.name}`,
          body: `"${title.trim()}" (${subject.trim()}) was submitted for study review.`,
          severity: 'INFO',
        }).catch(() => {});
      }
    }

    return task;
  }
}

/**
 * Lists tasks for the user
 */
export async function listTasks(user) {
  if (user.role === 'PARENT') {
    const res = await query(
      `SELECT t.*, u.name as student_name, p.name as parent_name
       FROM tasks t
       JOIN users u ON t.student_id = u.id
       LEFT JOIN users p ON t.parent_id = p.id
       JOIN parent_student_links psl ON psl.student_id = u.id
       WHERE psl.parent_id = $1 AND psl.status = 'ACTIVE'
       ORDER BY t.created_at DESC`,
      [user.id]
    );
    return res.rows;
  } else {
    const res = await query(
      `SELECT t.*, u.name as student_name, p.name as parent_name
       FROM tasks t
       JOIN users u ON t.student_id = u.id
       LEFT JOIN users p ON t.parent_id = p.id
       WHERE t.student_id = $1
       ORDER BY t.created_at DESC`,
      [user.id]
    );
    return res.rows;
  }
}

/**
 * Updates a task status
 */
export async function updateTaskStatus(taskId, newStatus, user) {
  const taskRes = await query(`SELECT * FROM tasks WHERE id = $1`, [taskId]);
  if (taskRes.rows.length === 0) {
    const err = new Error('Task not found');
    err.statusCode = 404;
    throw err;
  }

  const task = taskRes.rows[0];
  const now = new Date().toISOString();

  await query(
    `UPDATE tasks SET status = $1, updated_at = $2 WHERE id = $3`,
    [newStatus, now, taskId]
  );

  const updatedTask = { ...task, status: newStatus, updated_at: now };

  const io = getSocketServer();
  if (io) {
    if (task.student_id) {
      io.to(`user:${task.student_id}`).emit('task:status_changed', updatedTask);
    }
    if (task.parent_id) {
      io.to(`parent:${task.parent_id}`).emit('task:status_changed', updatedTask);
    }
  }

  return updatedTask;
}
