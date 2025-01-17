import define from '../../utils/define.js';
import config from '../../../config.js';
import { globalBus } from '../../utils/events.js';
import debounce from '../../utils/debounce.js'

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion)').matches;

const template = () => /*html*/`
  <form class="search-bar">
    <i class="ph-magnifying-glass-bold"></i>
    <input 
      type='search' 
      class='search-bar-input' 
      placeholder='Search on mwmbl...' 
      title='Use "CTRL+K" or "/" to focus.'
      autocomplete='off'
    >
  </form>
`;

export default define('search-bar', class extends HTMLElement {
  constructor() {
    super();
    this.searchInput = null;
    this.searchForm = null;
    this.abortController = new AbortController();
    this.__setup();
  }

  __setup() {
    this.innerHTML = template();
    this.searchInput = this.querySelector('input');
    this.searchForm = this.querySelector('form');
    this.__events();
  }

  __events() {
    const handleSubmit = async () => {
      // Update page title
      document.title = `MWMBL - ${this.searchInput.value || "Search"}`;

      // Update query params
      const queryParams = new URLSearchParams(document.location.search);
      // Sets query param if search value is not empty
      if (this.searchInput.value) queryParams.set(config.searchQueryParam, this.searchInput.value);
      else queryParams.delete(config.searchQueryParam);
      // New URL with query params
      const newURL = 
        document.location.protocol 
        + "//" 
        + document.location.host 
        + document.location.pathname 
        + (this.searchInput.value ? '?' : '')
        + queryParams.toString();
      // Replace history state
      window.history.replaceState({ path: newURL }, '', newURL);

      if (this.searchInput.value) {
        // Update body padding and switch search menu to compact mode
        document.body.style.paddingTop = '25px';
        document.querySelector('.search-menu').classList.add('compact');

        try {
          // Abort previous requests
          this.abortController.abort();
          this.abortController = new AbortController();
          // Get response from API
          const response = await fetch(`${config.publicApiURL}search?s=${encodeURIComponent(this.searchInput.value)}`, {
            signal: this.abortController.signal
          });
          // Getting results from API
          const search = await (response).json();
          // Creating a custom event to send search results
          const searchEvent = new CustomEvent('search', {
            detail: {
              results: this.searchInput.value ? search : null,
              error: null,
            },
          });
          // Dispatch search event throught the global event bus
          globalBus.dispatch(searchEvent);
        }
        catch(error) {
          // Creating a custom event to send error
          const searchEvent = new CustomEvent('search', {
            detail: {
              results: null,
              error
            },
          });
          // Dispatch search event throught the global event bus
          globalBus.dispatch(searchEvent);
        }
      }
      else {
        // Update body padding and switch search menu to normal mode
        document.body.style.paddingTop = '30vh';
        document.querySelector('.search-menu').classList.remove('compact');
        
        // Creating a custom event to send empty search value
        const searchEvent = new CustomEvent('search', {
          detail: {
            results: null,
            error: null,
          },
        });
        // Dispatch search event throught the global event bus
        globalBus.dispatch(searchEvent);
      }
    };

    /**
     * Always add the submit event, it makes things feel faster if
     * someone does not prefer reduced motion and reflexively hits
     * return once they've finished typing.
     *
     * Nota bene: this event is fired automatically by `connectedCallback`.
     */
    this.searchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      handleSubmit(e);
    });

    /**
     * Only add the "real time" search behavior when the client does
     * not prefer reduced motion; this prevents the page from changing
     * while the user is still typing their query.
     */
    if (!prefersReducedMotion) {
      this.searchInput.addEventListener('input', debounce(handleSubmit, 500))
    }

    // Focus search bar when pressing `ctrl + k` or `/`
    document.addEventListener('keydown', (e) => {
      if ((e.key === 'k' && e.ctrlKey) || e.key === '/' || e.key === 'Escape') {
        e.preventDefault();
        this.searchInput.focus();
      }
    });

    // Focus first result when pressing down arrow
    this.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' && this.searchInput.value) {
        e.preventDefault();
        const focusResultEvent = new CustomEvent('focus-result');
        globalBus.dispatch(focusResultEvent);
      }
    });

    globalBus.on('focus-search', (e) => {
      this.searchInput.focus();
    });
  }

  connectedCallback() {
    // Focus search input when component is connected
    this.searchInput.focus();

    const searchQuery = new URLSearchParams(document.location.search).get(config.searchQueryParam);
    this.searchInput.value = searchQuery;

    /**
     * Fire the submit event. It is always attached to the form, unlike the custom
     * `input` handler. Need to explicitly set the event to be cancellable so that
     * `preventDefault` works in the submit handler.
     *
     * This has the effect of the page re-evaluating the current search input,
     * primarily important for actually submitting the query param search pushed
     * into the input in the lines immediately before this.
     */
    this.searchForm.dispatchEvent(new Event('submit', { cancelable: true }));
  }
});
