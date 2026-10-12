const participantsRoot = document.getElementById('participants');
const callTitle = document.getElementById('call-title');
const overflow = document.getElementById('overflow');
const widget = document.getElementById('widget');

function render(state) {
  const settings = state?.settings || {};
  const participants = Array.isArray(state?.participants) ? state.participants : [];
  const visible = participants.slice(0, Number(settings.maxParticipants) || 8);

  document.body.style.opacity = String(Math.max(0.25, Math.min(1, (Number(settings.opacity) || 82) / 100)));
  widget.style.transform = `scale(${Math.max(0.75, Math.min(1.4, (Number(settings.scale) || 100) / 100))})`;
  widget.style.setProperty('--voice-accent', /^#[\da-f]{6}$/i.test(state?.accentColor) ? state.accentColor : '#22c55e');
  callTitle.hidden = !state?.callName;
  callTitle.textContent = state?.callName || '';
  participantsRoot.replaceChildren();

  for (const participant of visible) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = `participant-button${participant.isSpeaking ? ' speaking' : ''}`;
    row.setAttribute('aria-label', `${participant.name}${participant.isSpeaking ? ', falando' : ''}. Clique para voltar à chamada.`);
    row.addEventListener('click', () => window.sekaiOverlay?.restoreCall());

    if (settings.showAvatars !== false) {
      const avatar = document.createElement('span');
      avatar.className = 'avatar';
      const imageUrl = typeof participant.avatarUrl === 'string' && participant.avatarUrl.startsWith('https://') ? participant.avatarUrl : '';
      if (imageUrl) {
        const image = document.createElement('img');
        image.src = imageUrl;
        image.alt = '';
        image.referrerPolicy = 'no-referrer';
        avatar.append(image);
      } else {
        avatar.textContent = String(participant.name || '?').trim().charAt(0).toUpperCase() || '?';
      }
      row.append(avatar);
    }

    if (settings.showNames !== false) {
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = participant.name || 'Usuário';
      row.append(name);
    }

    if (!participant.micOn) {
      const muted = document.createElement('span');
      muted.className = 'mic';
      muted.textContent = '●';
      muted.title = 'Microfone desligado';
      row.append(muted);
    }

    participantsRoot.append(row);
  }

  const remaining = participants.length - visible.length;
  overflow.hidden = remaining <= 0;
  overflow.textContent = remaining > 0 ? `+${remaining} na chamada` : '';
}

window.sekaiOverlay?.onState(render);
