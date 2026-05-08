// js/custom-selects.js

export function applyCustomSelects() {
  document.querySelectorAll('select').forEach(selectEl => {
      let wrapper = selectEl.nextElementSibling;
      if (wrapper && wrapper.classList.contains('custom-select-wrapper')) {
          renderCustomOptions(selectEl, wrapper);
          return;
      }

      selectEl.style.display = 'none';
      selectEl.dataset.customized = "true";

      wrapper = document.createElement('div');
      wrapper.className = 'custom-select-wrapper';
      
      const trigger = document.createElement('div');
      trigger.className = 'custom-select-trigger';
      
      const optionsContainer = document.createElement('div');
      optionsContainer.className = 'custom-select-options';

      wrapper.appendChild(trigger);
      wrapper.appendChild(optionsContainer);
      
      selectEl.parentNode.insertBefore(wrapper, selectEl.nextSibling);

      renderCustomOptions(selectEl, wrapper);

      trigger.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          
          const isOpen = wrapper.classList.contains('open');
          document.querySelectorAll('.custom-select-wrapper').forEach(w => w.classList.remove('open'));
          
          if (!isOpen) {
              wrapper.classList.add('open');
          }
      });
  });
}

function renderCustomOptions(selectEl, wrapper) {
  const trigger = wrapper.querySelector('.custom-select-trigger');
  const optionsContainer = wrapper.querySelector('.custom-select-options');
  optionsContainer.innerHTML = '';
  
  trigger.innerHTML = `<span style="pointer-events: none;">${selectEl.options[selectEl.selectedIndex]?.text || ''}</span><span class="chevron" style="pointer-events: none;"></span>`;

  Array.from(selectEl.children).forEach(child => {
      if (child.tagName === 'OPTGROUP') {
          const group = document.createElement('div');
          group.className = 'custom-select-optgroup';
          group.textContent = child.label;
          optionsContainer.appendChild(group);

          Array.from(child.children).forEach(opt => {
              createCustomOption(opt, selectEl, wrapper, optionsContainer, trigger, true);
          });
      } else if (child.tagName === 'OPTION') {
          createCustomOption(child, selectEl, wrapper, optionsContainer, trigger, false);
      }
  });
}

function createCustomOption(opt, selectEl, wrapper, container, trigger, isIndented) {
  const optDiv = document.createElement('div');
  optDiv.className = 'custom-select-option' + (isIndented ? ' indented' : '') + (opt.selected ? ' selected' : '');
  optDiv.textContent = opt.text;
  optDiv.dataset.value = opt.value;
  
  optDiv.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      if (selectEl.value !== opt.value) {
          selectEl.value = opt.value;
          selectEl.dispatchEvent(new Event('change'));
      }
      wrapper.classList.remove('open');
      
      trigger.innerHTML = `<span style="pointer-events: none;">${opt.text}</span><span class="chevron" style="pointer-events: none;"></span>`;
      container.querySelectorAll('.custom-select-option').forEach(o => o.classList.remove('selected'));
      optDiv.classList.add('selected');
  });
  container.appendChild(optDiv);
}

// Global click listener to close custom dropdowns
document.addEventListener('click', () => {
  document.querySelectorAll('.custom-select-wrapper').forEach(w => w.classList.remove('open'));
});