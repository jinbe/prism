import { mount } from 'svelte'
import App from './App.svelte'
import '@fontsource-variable/bricolage-grotesque'
import '@fontsource-variable/hanken-grotesk'
import '@fontsource-variable/spline-sans-mono'
import './styles.css'

// macOS gets the frameless (hiddenInset) window; reserve room for the traffic
// lights in the instrument bar. Renderer can't see process.platform under
// context isolation, so sniff the UA — good enough for a layout hint.
if (/Mac/i.test(navigator.platform)) document.documentElement.classList.add('is-mac')

const app = mount(App, { target: document.getElementById('root')! })

export default app
