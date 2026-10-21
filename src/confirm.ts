// In-page confirmation avoids blocking embedded browsers and keeps focus accessible.
export function confirmAction(message: string): Promise<boolean> {
  if (document.getElementById('action-confirmation')) return Promise.resolve(false);
  return new Promise(resolve => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.createElement('dialog');
    dialog.id = 'action-confirmation';
    dialog.className = 'action-confirmation';
    dialog.setAttribute('aria-labelledby', 'confirmation-title');
    dialog.setAttribute('aria-describedby', 'confirmation-message');
    const title = document.createElement('h2');
    title.id = 'confirmation-title';
    title.textContent = 'Confirm action';
    const body = document.createElement('p');
    body.id = 'confirmation-message';
    body.textContent = message;
    const actions = document.createElement('div');
    actions.className = 'actions';
    const cancel = document.createElement('button');
    cancel.textContent = 'Cancel';
    const proceed = document.createElement('button');
    proceed.textContent = 'Confirm';
    function finish(accepted: boolean) {
      window.removeEventListener('popstate', dismissed);
      dialog.close();
      dialog.remove();
      if (previous?.isConnected) previous.focus();
      resolve(accepted);
    }
    const dismissed = () => finish(false);
    cancel.onclick = dismissed;
    proceed.onclick = () => finish(true);
    dialog.addEventListener('cancel', event => { event.preventDefault(); dismissed(); });
    window.addEventListener('popstate', dismissed, { once: true });
    actions.append(cancel, proceed);
    dialog.append(title, body, actions);
    document.body.append(dialog);
    dialog.showModal();
    cancel.focus();
  });
}
