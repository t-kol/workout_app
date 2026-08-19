import { supabase } from './supabaseClient.js';
import { showWorkoutForm, deleteWorkout } from './crud.js'; 

let currentDate = new Date();

const DISCIPLINE_CONFIG = {
  swim:     { icon: '🏊', label: 'Swim', color: 'border-cyan-500 bg-cyan-950/40 text-cyan-400' },
  bike:     { icon: '🚴', label: 'Bike', color: 'border-emerald-500 bg-emerald-950/40 text-emerald-400' },
  run:      { icon: '🏃', label: 'Run', color: 'border-amber-500 bg-amber-950/40 text-amber-400' },
  brick:    { icon: '🧱', label: 'Brick', color: 'border-purple-500 bg-purple-950/40 text-purple-400' },
  lift:     { icon: '🏋️', label: 'Lift', color: 'border-rose-500 bg-rose-950/40 text-rose-400' },
  mobility: { icon: '🧘', label: 'Mobility', color: 'border-teal-500 bg-teal-950/40 text-teal-400' },
  other:    { icon: '⚙️', label: 'Other', color: 'border-slate-500 bg-slate-800 text-slate-300' }
};

// Timezone-safe date formatter
function formatDateToISO(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateReadable(date) {
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

export async function initTodayView() {
  const container = document.getElementById('view-today');
  if (!container) return;

  container.innerHTML = `
    <div class="space-y-4">
      <!-- Date Navigation Header -->
      <div class="flex items-center justify-between bg-slate-800 p-3 rounded-xl border border-slate-700">
        <button id="prev-day-btn" class="px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded-lg text-slate-200">◀</button>
        <div class="text-center">
          <div id="date-display" class="font-bold text-base sm:text-lg"></div>
          <button id="today-btn" class="text-xs text-amber-500 hover:underline">Jump to Today</button>
        </div>
        <div class="flex items-center space-x-2">
          <button id="add-btn" class="px-3 py-1 bg-amber-500 hover:bg-amber-600 rounded-lg text-slate-900 font-bold">+</button>
          <button id="next-day-btn" class="px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded-lg text-slate-200">▶</button>
        </div>
      </div>

      <!-- Workout Sessions List -->
      <div id="sessions-container" class="space-y-3">
        <div class="text-center py-8 text-slate-400">Loading workouts...</div>
      </div>
    </div>
  `;

  // Bind navigation listeners
  document.getElementById('prev-day-btn').addEventListener('click', () => changeDate(-1));
  document.getElementById('next-day-btn').addEventListener('click', () => changeDate(1));
  document.getElementById('today-btn').addEventListener('click', () => {
    currentDate = new Date();
    loadSessions();
  });

  // Bind Add button listener
  document.getElementById('add-btn').addEventListener('click', () => {
    const dateStr = formatDateToISO(currentDate);
    showWorkoutForm(dateStr, null, loadSessions);
  });

  await loadSessions();
}

function changeDate(offsetDays) {
  currentDate.setDate(currentDate.getDate() + offsetDays);
  loadSessions();
}

async function loadSessions() {
  const dateStr = formatDateToISO(currentDate);
  document.getElementById('date-display').textContent = formatDateReadable(currentDate);
  const listEl = document.getElementById('sessions-container');

  try {
    // UPDATED: Removed the join to workout_logs, querying workouts directly
    const { data: workouts, error } = await supabase
      .from('workouts')
      .select('*')
      .eq('date', dateStr)
      .order('session_slot', { ascending: true });

    if (error) throw error;

    if (!workouts || workouts.length === 0) {
      listEl.innerHTML = `
        <div class="text-center py-10 bg-slate-800/50 rounded-xl border border-slate-700/50 text-slate-400">
          No workouts planned for this day.
        </div>
      `;
      return;
    }

    renderSessions(workouts);
  } catch (err) {
    console.error('Error fetching sessions:', err);
    listEl.innerHTML = `<div class="text-red-400 p-4 text-center">Failed to load workouts.</div>`;
  }
}

function renderSessions(workouts) {
  const listEl = document.getElementById('sessions-container');
  listEl.innerHTML = '';

  workouts.forEach((workout) => {
    const config = DISCIPLINE_CONFIG[workout.discipline] || DISCIPLINE_CONFIG.other;
    
    // UPDATED: Check completion status directly from the workout row
    const isCompleted = workout.completed === true;

    const card = document.createElement('div');
    card.className = `bg-slate-800 rounded-xl border p-4 space-y-2 transition ${config.color.split(' ')[0]}`;

    // UPDATED: Replaced old metric variables with your new schema columns
    const plannedMetrics = [];
    if (workout.planned_duration_mins) plannedMetrics.push(`${workout.planned_duration_mins}m`);
    if (workout.planned_distance_miles) plannedMetrics.push(`${workout.planned_distance_miles} mi`);
    if (workout.planned_distance_meters) plannedMetrics.push(`${workout.planned_distance_meters}m`);
    if (workout.planned_intensity) plannedMetrics.push(workout.planned_intensity);

    card.innerHTML = `
      <div class="flex items-center justify-between gap-3">
        <div class="flex items-center space-x-3 flex-1 min-w-0">
          <input type="checkbox" ${isCompleted ? 'checked' : ''} 
            class="complete-checkbox w-5 h-5 rounded border-slate-600 bg-slate-700 text-amber-500 focus:ring-0 cursor-pointer">
          
          <div class="cursor-pointer flex-1 min-w-0 toggle-details">
            <div class="flex items-center space-x-2">
              <span class="text-xs px-2 py-0.5 rounded font-mono font-semibold bg-slate-900/60 text-slate-300">
                ${workout.session_slot}
              </span>
              <span class="text-lg">${config.icon}</span>
              <h3 class="font-bold truncate text-slate-100 title-text ${isCompleted ? 'line-through text-slate-400' : ''}">
                ${workout.title}
              </h3>
            </div>
            ${plannedMetrics.length ? `<p class="text-xs text-slate-400 mt-1 ml-1">${plannedMetrics.join(' • ')}</p>` : ''}
          </div>
        </div>
      </div>

      <div class="details-panel hidden pt-3 border-t border-slate-700/50 text-sm text-slate-300 space-y-2">
        ${workout.description ? `<div><span class="text-xs text-slate-400 block font-semibold">Description</span>${workout.description}</div>` : ''}
        ${workout.notes ? `<div><span class="text-xs text-slate-400 block font-semibold">Planned Notes</span>${workout.notes}</div>` : ''}
        ${!workout.description && !workout.notes ? '<div class="text-xs text-slate-500 italic">No additional details provided.</div>' : ''}
        
        <!-- CRUD Buttons -->
        <div class="mt-4 pt-3 border-t border-slate-700/50 flex space-x-3">
          <button class="edit-btn px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-xs font-medium text-slate-200">Edit</button>
          <button class="delete-btn px-3 py-1 bg-red-900/40 hover:bg-red-800/60 rounded text-xs font-medium text-red-400">Delete</button>
        </div>
      </div>
    `;

    // Handle Checkbox Toggling
    const checkbox = card.querySelector('.complete-checkbox');
    checkbox.addEventListener('change', async (e) => {
      e.stopPropagation();
      const isChecked = checkbox.checked;
      
      // Optimistic UI update for text style
      const titleEl = card.querySelector('.title-text');
      if (isChecked) {
        titleEl.classList.add('line-through', 'text-slate-400');
      } else {
        titleEl.classList.remove('line-through', 'text-slate-400');
      }

      try {
        // UPDATED: We now just update the 'completed' column on the workouts table directly
        const { error } = await supabase
          .from('workouts')
          .update({ completed: isChecked })
          .eq('id', workout.id);

        if (error) throw error;
        
        // Keep local state in sync
        workout.completed = isChecked;

      } catch (err) {
        console.error('Failed to update completion status:', err);
        // Revert UI on failure
        checkbox.checked = !isChecked;
        if (!isChecked) {
          titleEl.classList.add('line-through', 'text-slate-400');
        } else {
          titleEl.classList.remove('line-through', 'text-slate-400');
        }
        
        // Exposing the exact error message to make debugging easier
        alert(`Could not update workout status: ${err.message || "Unknown error"}`);
      }
    });

    card.querySelector('.toggle-details').addEventListener('click', () => {
      const details = card.querySelector('.details-panel');
      details.classList.toggle('hidden');
    });

    card.querySelector('.edit-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      const dateStr = formatDateToISO(currentDate);
      showWorkoutForm(dateStr, workout, loadSessions);
    });

    card.querySelector('.delete-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteWorkout(workout.id, loadSessions);
    });

    listEl.appendChild(card);
  });
}