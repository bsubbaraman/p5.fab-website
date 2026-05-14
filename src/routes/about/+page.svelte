<script>
	import Header from '../../components/Header.svelte';
</script>

<main>
	<Header />
	<div class="page-container card">
		<h1>About</h1>
		<div class="about">
			p5.fab is a tool for learning about machines. Built on top of the creative coding library
			p5.js, it helps you make physical things using code!

			<br /> <br />

			On this website—copypastes.xyz—you can share your own experiments and remix others'. Like
			<a href="https://www.thingiverse.com/" target="_blank" rel="noopener noreferrer"
				>Thingiverse</a
			>
			for 3D printing or
			<a href="https://openprocessing.org/" target="_blank" rel="noopener noreferrer"
				>OpenProcessing</a
			>
			for creative code, the goal is to cultivate a community around machine and material explorations.
			To get started, check out the
			<a
				href="https://machineagency.github.io/p5.fab-docs/docs/resources/"
				target="_blank"
				rel="noopener noreferrer">tutorials</a
			>, <a href="https://www.copypastes.xyz" target="_blank" rel="noopener noreferrer">browse</a>
			recent projects, or make something
			<a href="https://www.copypastes.xyz/sketch/new" target="_blank" rel="noopener noreferrer"
				>new</a
			>!

			<br /> <br />

			p5.fab was made by
			<a href="https://blairsubbaraman.com/" target="_blank" rel="noopener noreferrer"
				>Blair Subbaraman</a
			>
			to make authoring physical processes more like authoring code: a dynamic mode of creative inquiry
			for insight and expression. If you have questions, comments, improvements, or anything else you
			want to talk about, don't hesitate to reach him at
			<a href="mailto:b1air@uw.edu">b1air@uw.edu</a>!
		</div>
	</div>
</main>

<style>
	.about {
		font-size: 18px;
	}

	.about a {
		text-decoration: underline;
		text-decoration-color: var(--remix);
		text-decoration-thickness: 3px;
	}

	.about a:hover {
		text-decoration-color: var(--ma-orange);
	}
</style>
