import { supabase } from './supabaseClient.js';

export function showWorkoutForm(dateStr, existingWorkout = null, onSuccess) {
  // Remove existing modal if any
  const existingModal = document.getElementById('crud-modal');
  if (existingModal) existingModal.remove();

  const isEdit = !!existingWorkout;
  
  const modal = document.createElement('div');
  modal.id = 'crud-modal';
  modal.className = 'fixed inset-0 bg-slate-900/80 flex items-center justify-center p-4 z-50 overflow-y-auto';
  
  modal.innerHTML = `
    <div class="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-md p-6 shadow-xl my-auto">
      <div class="flex justify-between items-center mb-4">
        <h2 class="text-xl font-bold text-amber-500">${isEdit ? 'Edit Session' : 'Add Session'}</h2>
        <button type="button" id="crud-close" class="text-slate-400 hover:text-slate-200">✖</button>
      </div>
      
      <form id="crud-form" class="space-y-4">
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium mb-1 text-slate-300">Discipline *</label>
            <select id="crud-discipline" required class="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-amber-500">
              <option value="swim">Swim</option>
              <option value="bike">Bike</option>
              <option value="run">Run</option>
              <option value="brick">Brick</option>
              <option value="lift">Lift</option>
              <option value="mobility">Mobility</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium mb-1 text-slate-300">Session Slot *</label>
            <input type="text" id="crud-slot" required value="WO1" class="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-amber-500">
          </div>
        </div>

        <div>
          <label class="block text-sm font-medium mb-1 text-slate-300">Title *</label>
          <input type="text" id="crud-title" required class="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-amber-500">
        </div>

        <div class="grid grid-cols-3 gap-4">
          <div>
            <label class="block text-sm font-medium mb-1 text-slate-300 text-center">Min</label>
            <input type="number" id="crud-duration" min="0" placeholder="0" class="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-center">
          </div>
          <div>
            <label class="block text-sm font-medium mb-1 text-slate-300 text-center">Km</label>
            <input type="number" step="0.01" min="0" id="crud-distance" placeholder="0.0" class="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-center">
          </div>
          <div>
            <label class="block text-sm font-medium mb-1 text-slate-300 text-center">Intensity</label>
            <input type="text" id="crud-intensity" class="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-center" placeholder="e.g. Z2">
          </div>
        </div>

        <div>
          <label class="block text-sm font-medium mb-1 text-slate-300">Description</label>
          <textarea id="crud-description" rows="2" class="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"></textarea>
        </div>
        
        <div>
          <label class="block text-sm font-medium mb-1 text-slate-300">Planned Notes</label>
          <textarea id="crud-notes" rows="2" class="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"></textarea>
        </div>

        <div id="crud-error" class="text-red-400 text-sm hidden"></div>

        <div class="pt-2 flex justify-end space-x-3">
          <button type="button" id="crud-cancel" class="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-slate-200">Cancel</button>
          <button type="submit" id="crud-save" class="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-900 font-semibold rounded-lg">Save</button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(modal);

  // Pre-fill if editing
  if (isEdit) {
    document.getElementById('crud-discipline').value = existingWorkout.discipline;
    document.getElementById('crud-slot').value = existingWorkout.session_slot;
    document.getElementById('crud-title').value = existingWorkout.title;
    document.getElementById('crud-duration').value = existingWorkout.planned_duration_min || '';
    document.getElementById('crud-distance').value = existingWorkout.planned_distance_km || '';
    document.getElementById('crud-intensity').value = existingWorkout.planned_intensity || '';
    document.getElementById('crud-description').value = existingWorkout.description || '';
    document.getElementById('crud-notes').value = existingWorkout.notes || '';
  }

  const closeForm = () => modal.remove();
  document.getElementById('crud-close').addEventListener('click', closeForm);
  document.getElementById('crud-cancel').addEventListener('click', closeForm);

  document.getElementById('crud-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('crud-save');
    const errEl = document.getElementById('crud-error');
    btn.disabled = true;
    btn.textContent = 'Saving...';
    errEl.classList.add('hidden');

    const payload = {
      date: dateStr,
      discipline: document.getElementById('crud-discipline').value,
      session_slot: document.getElementById('crud-slot').value || 'WO1',
      title: document.getElementById('crud-title').value,
      planned_duration_min: document.getElementById('crud-duration').value ? parseInt(document.getElementById('crud-duration').value) : null,
      planned_distance_km: document.getElementById('crud-distance').value ? parseFloat(document.getElementById('crud-distance').value) : null,
      planned_intensity: document.getElementById('crud-intensity').value || null,
      description: document.getElementById('crud-description').value || null,
      notes: document.getElementById('crud-notes').value || null,
    };

    try {
      let error;
      if (isEdit) {
        const { error: updateErr } = await supabase.from('workouts').update(payload).eq('id', existingWorkout.id);
        error = updateErr;
      } else {
        const { error: insertErr } = await supabase.from('workouts').insert([payload]);
        error = insertErr;
      }

      if (error) throw error;
      
      closeForm();
      if (onSuccess) onSuccess();
    } catch (err) {
      console.error(err);
      errEl.textContent = err.message || 'Failed to save workout.';
      errEl.classList.remove('hidden');
      btn.disabled = false;
      btn.textContent = 'Save';
    }
  });
}

export async function deleteWorkout(id, onSuccess) {
  if (!confirm('Are you sure you want to delete this session? This will also permanently erase any logged actuals for it.')) return;
  
  try {
    const { error } = await supabase.from('workouts').delete().eq('id', id);
    if (error) throw error;
    if (onSuccess) onSuccess();
  } catch (err) {
    console.error('Delete error:', err);
    alert('Failed to delete workout: ' + err.message);
  }
}