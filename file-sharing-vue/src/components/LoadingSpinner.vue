<template>
	<div class="loading-spinner border-neutral-200 dark:border-t-neutral-200 dark:border-neutral-500 border-t-neutral-500 rounded-full"></div>
</template>

<style>
.loading-spinner {
	border-width: 0.2rem;
	animation: spin 2s linear infinite;
	display: inline-block;
}

@keyframes spin {
	0% {
		transform: rotate(0deg);
	}
	100% {
		transform: rotate(360deg);
	}
}
</style>
