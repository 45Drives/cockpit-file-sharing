<template>
  <div class="ffdHeaderContainer">
    <h1 class="ffdLogoA">45</h1>
    <h1 class="ffdLogoB">Drives</h1>
    <h1 class="ffdModuleName">{{ moduleName }}</h1>
    <button
      @click="switchTheme"
      id="theme-toggle"
      type="button"
      class="text-stone-500 dark:text-stone-400 hover:bg-stone-200 dark:hover:bg-stone-700 focus:outline-none rounded-lg text-sm p-2.5 justify-self-end"
    >
      <svg
        v-if="!darkMode"
        id="theme-toggle-dark-icon"
        class="w-5 h-5"
        fill="currentColor"
        viewBox="0 0 20 20"
      >
        <path
          d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z"
        ></path>
      </svg>
      <svg
        v-if="darkMode"
        id="theme-toggle-light-icon"
        class="w-5 h-5"
        fill="currentColor"
        viewBox="0 0 20 20"
      >
        <path
          d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z"
          fill-rule="evenodd"
          clip-rule="evenodd"
        ></path>
      </svg>
    </button>
  </div>
</template>

<script>
import "@fontsource/red-hat-text/700.css";
import "@fontsource/red-hat-text/400.css";
import "source-sans-pro/source-sans-pro.css";

export default {
  props: {
    moduleName: String,
  },
  data() {
    function setTheme() {
      if (
        localStorage.getItem("color-theme") === "dark" ||
        (!("color-theme" in localStorage) &&
          window.matchMedia("(prefers-color-scheme: dark)").matches)
      ) {
        document.documentElement.classList.add("dark");
        return true;
      } else {
        document.documentElement.classList.remove("dark");
        return false;
      }
    }
    return {
      darkMode: setTheme(),
    };
  },
  methods: {
    switchTheme() {
      console.log("switch theme invoked.");
      // toggle icons inside button
      this.darkMode = !this.darkMode;

      // if set via local storage previously
      if (localStorage.getItem("color-theme")) {
        if (localStorage.getItem("color-theme") === "light") {
          document.documentElement.classList.add("dark");
          localStorage.setItem("color-theme", "dark");
          this.darkMode = true;
        } else {
          document.documentElement.classList.remove("dark");
          localStorage.setItem("color-theme", "light");
          this.darkMode = false;
        }

        // if NOT set via local storage previously
      } else {
        if (document.documentElement.classList.contains("dark")) {
          document.documentElement.classList.remove("dark");
          localStorage.setItem("color-theme", "light");
          this.darkMode = false;
        } else {
          document.documentElement.classList.add("dark");
          localStorage.setItem("color-theme", "dark");
          this.darkMode = true;
        }
      }
    },
  },
};
</script>

<style>
#theme-toggle {
  margin-left: auto;
}

.ffdHeaderContainer {
  @apply flex items-baseline bg-stone-100 dark:bg-stone-900 border-b border-stone-200 dark:border-stone-700;
  display: fixes;
  top: 0;
  padding: 0;
  font-family: "Red Hat Text";
}

.ffdModuleName {
  @apply text-red-800 dark:text-white;
  margin: 0.5rem 0 0.5rem 1rem;
  font-weight: 400;
  font-size: x-large;
}
.ffdLogoA {
  @apply text-red-800 dark:text-white;
  font-weight: 700;
  margin: 0.5rem 0 0.5rem 0.5rem;
  font-size: 1.6em;
  font-family: "Source Sans Pro",sans-serif;
}
.ffdLogoB {
  @apply text-stone-800 dark:text-red-600;
  font-weight: 400;
  margin: 0.5rem 0 0.5rem 0;
  font-size: x-large;
}
</style>
