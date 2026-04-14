import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import router from "./router/index.ts";
import { useAppConfigStore } from "./stores/app-config.ts";
import "./style.css";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("App root not found.");
}

const pinia = createPinia();
const appInstance = createApp(App);

appInstance.use(pinia);
appInstance.use(router);

const appConfigStore = useAppConfigStore(pinia);
appConfigStore.initialize();

appInstance.mount(app);
