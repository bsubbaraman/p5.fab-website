<script>
	import { onMount } from 'svelte';
	import * as d3 from 'd3';
	import { db } from '../dbConfig.js';
	import { collection, getDocs } from 'firebase/firestore';
	import { escapeHTML } from '$lib/escapeHtml.js';

	let { objectID } = $props();
	let graphInitialized = $state(false);
	let container;

	// Graph Variables
	let graphData = $state({
		nodes: [],
		links: []
	});
	const graphDist = 160; // distance between nodes
	const nodeSize = 75; // how big nodes are rendered

	// Filter Variables
	let availableMaterials = $state([]);
	let selectedMaterials = $state([]);
	let selectedFabStatus = $state([]);

	// Created in onMount (client-only) and reused across renders
	let tooltip;

	function renderGraph(graphData) {
		// Clone graph data so we can rerender
		const clonedGraphData = {
			nodes: graphData.nodes.map((node) => ({ ...node })),
			links: graphData.links.map((link) => ({ ...link }))
		};
		// Clear previous graph
		d3.select(container).select('svg').remove();

		const { width, height } = container.getBoundingClientRect();
		const svg = d3
			.select(container)
			.append('svg')
			.attr('viewBox', `0 0 ${width} ${height}`)
			.attr('preserveAspectRatio', 'xMidYMid meet')
			.attr('width', '100%')
			.attr('height', '100%');

		// Dynamic sizing: shrink nodes and distances as count grows
		const n = clonedGraphData.nodes.length;
		const scaleFactor = Math.max(0.45, Math.min(1.0, Math.sqrt(7 / Math.max(n, 1))));
		const dynNodeSize = Math.round(nodeSize * scaleFactor);
		const dynGraphDist = Math.round(graphDist * scaleFactor);
		const nodeRadius = dynNodeSize / 2 + 2;
		const edgeR = nodeRadius + 8;

		// Zoom/pan layer — all graph elements go inside this group
		const zoomGroup = svg.append('g');
		const zoomBehavior = d3
			.zoom()
			.scaleExtent([0.1, 8])
			.on('zoom', (event) => zoomGroup.attr('transform', event.transform));
		svg.call(zoomBehavior);

		const simulation = d3
			.forceSimulation(clonedGraphData.nodes)
			.force(
				'link',
				d3
					.forceLink(clonedGraphData.links)
					.id((d) => d.id)
					.distance(dynGraphDist)
			)
			.force('charge', d3.forceManyBody().strength(-800 * scaleFactor))
			.force('center', d3.forceCenter(width / 2, height / 2))
			.force('collide', d3.forceCollide().radius(nodeRadius + 15).iterations(3));

		// Arrow marker (in SVG defs, not zoom group — references work globally)
		svg
			.append('defs')
			.append('marker')
			.attr('id', 'arrow')
			.attr('viewBox', '0 -5 10 10')
			.attr('refX', 10)
			.attr('refY', 0)
			.attr('markerWidth', 6)
			.attr('markerHeight', 6)
			.attr('orient', 'auto')
			.append('path')
			.attr('d', 'M0,-5L10,0L0,5')
			.attr('fill', '#000');

		// Clip paths (in SVG defs, referenced by zoom-group elements)
		const defs = svg.append('defs');
		defs
			.selectAll('clipPath')
			.data(clonedGraphData.nodes)
			.join('clipPath')
			.attr('id', (d) => `clip-${d.id}`)
			.append('circle')
			.attr('r', dynNodeSize / 2)
			.attr('cx', 0)
			.attr('cy', 0);

		const link = zoomGroup
			.append('g')
			.attr('stroke', '#000')
			.attr('stroke-opacity', 1)
			.selectAll('line')
			.data(clonedGraphData.links)
			.join('line')
			.attr('stroke-width', 2)
			.attr('marker-end', 'url(#arrow)');

		const node = zoomGroup
			.append('g')
			.selectAll('g')
			.data(clonedGraphData.nodes)
			.join('g')
			.call(drag(simulation));

		// Border circle
		node
			.append('circle')
			.attr('r', nodeRadius)
			.attr('fill', 'none')
			.attr('stroke', 'black')
			.attr('stroke-width', 2);

		// Image with clipPath
		node
			.append('image')
			.attr('href', (d) => d.img || '')
			.attr('width', dynNodeSize)
			.attr('height', dynNodeSize)
			.attr('x', -dynNodeSize / 2)
			.attr('y', -dynNodeSize / 2)
			.attr('clip-path', (d) => `url(#clip-${d.id})`);

		node
			.on('mouseover', (event, d) => {
				tooltip
					.style('opacity', 1)
					.html(`<b>${escapeHTML(d.name)}</b><br/>by <b>${escapeHTML(d.username)}</b>`);
			})
			.on('mousemove', (event) => {
				tooltip.style('left', event.pageX + 25 + 'px').style('top', event.pageY + 'px');
			})
			.on('mouseout', () => {
				tooltip.style('opacity', 0);
			})
			.on('click', (event, d) => {
				window.open(`/fabs/${d.id}`, '_blank');
			});
		node.style('cursor', 'pointer');

		simulation.on('tick', () => {
			link
				.attr('x1', (d) => {
					const dx = d.target.x - d.source.x;
					const dy = d.target.y - d.source.y;
					const dist = Math.sqrt(dx * dx + dy * dy) || 1;
					return d.source.x + (dx / dist) * nodeRadius;
				})
				.attr('y1', (d) => {
					const dx = d.target.x - d.source.x;
					const dy = d.target.y - d.source.y;
					const dist = Math.sqrt(dx * dx + dy * dy) || 1;
					return d.source.y + (dy / dist) * nodeRadius;
				})
				.attr('x2', (d) => {
					const dx = d.target.x - d.source.x;
					const dy = d.target.y - d.source.y;
					const dist = Math.sqrt(dx * dx + dy * dy) || 1;
					return d.target.x - (dx / dist) * edgeR;
				})
				.attr('y2', (d) => {
					const dx = d.target.x - d.source.x;
					const dy = d.target.y - d.source.y;
					const dist = Math.sqrt(dx * dx + dy * dy) || 1;
					return d.target.y - (dy / dist) * edgeR;
				});

			node.attr('transform', (d) => `translate(${d.x},${d.y})`);
		});

		function drag(sim) {
			function dragstarted(event, d) {
				if (!event.active) sim.alphaTarget(0.3).restart();
				d.fx = d.x;
				d.fy = d.y;
			}
			function dragged(event, d) {
				d.fx = event.x;
				d.fy = event.y;
			}
			function dragended(event, d) {
				if (!event.active) sim.alphaTarget(0);
				d.fx = null;
				d.fy = null;
			}
			// filter: only drag on left-click, not on zoom pan gestures
			return d3.drag()
				.filter((event) => !event.ctrlKey && event.button === 0)
				.on('start', dragstarted)
				.on('drag', dragged)
				.on('end', dragended);
		}
	}

	let allPostsCache = null;

	async function loadAllPosts() {
		if (allPostsCache) return allPostsCache;
		const snap = await getDocs(collection(db, 'posts'));
		const result = {};
		snap.forEach((doc) => {
			if (doc.id !== 'allPosts') result[doc.id] = doc.data();
		});
		allPostsCache = result;
		return result;
	}

	function findConnectedPosts(postID, allPostsRaw) {
		const allPostsData = Object.entries(allPostsRaw).map(([id, post]) => ({
			id,
			img: post.thumbnail ?? post.files?.[0] ?? null,
			name: post.name,
			username: post.username,
			...post
		}));

		const idToPost = {};
		const childrenMap = {};

		allPostsData.forEach((post) => {
			idToPost[post.id] = post;
			if (post.parentSketch) {
				if (!childrenMap[post.parentSketch]) {
					childrenMap[post.parentSketch] = [];
				}
				childrenMap[post.parentSketch].push(post);
			}
		});

		// Walk up to the root/original post
		let rootID = postID;
		while (idToPost[rootID] && idToPost[rootID].parentSketch) {
			rootID = idToPost[rootID].parentSketch;
		}

		// Step 3: depth first search to find all descendants (remixes)
		const connectedPosts = [];
		const visited = new Set();

		function dfs(currentID) {
			if (visited.has(currentID)) return;
			visited.add(currentID);

			const post = idToPost[currentID];
			if (post) {
				connectedPosts.push(post);
			}

			const children = childrenMap[currentID] || [];
			for (const child of children) {
				dfs(child.id);
			}
		}

		dfs(rootID);

		return connectedPosts;
	}

	function formatGraphData(connectedPosts) {
		const nodes = [];
		const links = [];

		const idToGroup = {}; // Optional: group by depth or other metadata
		const idToPost = {};

		// First, index all posts by ID
		connectedPosts.forEach((post) => {
			idToPost[post.id] = post;
		});

		// Optional: assign group by remix depth (can be adjusted as needed)
		function getGroup(post) {
			let depth = 0;
			let current = post;
			while (current && current.parentSketch) {
				current = idToPost[current.parentSketch];
				depth += 1;
			}
			return depth; // use depth as group number
		}

		// Create nodes
		connectedPosts.forEach((post) => {
			const group = getGroup(post);
			idToGroup[post.id] = group;

			nodes.push({
				id: post.id, // or post.title if you prefer
				group,
				img: post.img,
				name: post.name,
				username: post.username,
				materials: post.materials,
				hasFabricated: post.hasFabricated
			});

			if (post.parentSketch && idToPost[post.parentSketch]) {
				links.push({
					source: post.parentSketch,
					target: post.id
				});
			}
		});

		return { nodes, links };
	}

	async function makeRemixGraph() {
		const allPostsRaw = await loadAllPosts();
		const connectedPosts = findConnectedPosts(objectID, allPostsRaw);
		const formatted = formatGraphData(connectedPosts);
		renderGraph(formatted);
		extractAvailableMaterials(formatted.nodes);
		graphData.nodes = formatted.nodes;
		graphData.links = formatted.links;
	}

	function extractAvailableMaterials(nodes) {
		const allMaterials = nodes.flatMap((node) => node.materials || []);
		const uniqueMaterials = Array.from(new Set(allMaterials));
		availableMaterials = uniqueMaterials.sort(); // optional sort
	}

	function handleFilter() {
		// TODO: generalizable filtering

		// If nothing selected, show full graph
		if (selectedMaterials.length === 0 && selectedFabStatus.length == 0) {
			renderGraph(graphData);
			return;
		}
		console.log(selectedFabStatus);

		// Filter nodes that contain one or more selected materials
		const filteredNodes = graphData.nodes.filter(
			(node) =>
				(selectedMaterials.length === 0 ||
					node.materials?.some((m) => selectedMaterials.includes(m))) &&
				(selectedFabStatus.length === 0 || selectedFabStatus.includes(node.hasFabricated))
		);
		console.log(filteredNodes);

		// Build a Set of node IDs for fast lookup
		const visibleNodeIDs = new Set(filteredNodes.map((n) => n.id));

		// Only include links where both source & target are in filtered nodes
		const filteredLinks = graphData.links.filter(
			(link) => visibleNodeIDs.has(link.source) && visibleNodeIDs.has(link.target)
		);

		// Clear the existing graph SVG
		d3.select(container).select('svg').remove();

		// Render the new filtered graph
		renderGraph({ nodes: filteredNodes, links: filteredLinks });
	}

	onMount(() => {
		tooltip = d3
			.select('body')
			.append('div')
			.style('position', 'absolute')
			.style('padding', '6px 10px')
			.style('background', '#fff')
			.style('color', '#000')
			.style('border-radius', '6px')
			.style('font-size', '16px')
			.style('font-family', 'Inter')
			.style('pointer-events', 'none')
			.style('opacity', 0);

		makeRemixGraph().then(() => {
			graphInitialized = true;
		});
	});
</script>

<div class="container">
	<div bind:this={container} class="graph"></div>

	<!-- Right Sidebar -->
	<div class="sidebar">
		<h2>Remix Graph Filter</h2>
		<form on:submit|preventDefault={handleFilter}>
			<fieldset>
				<legend><h3>General</h3></legend>
				<label>
					<input type="checkbox" bind:group={selectedFabStatus} value="yes" />
					Fabricated
				</label>
				<label>
					<input type="checkbox" bind:group={selectedFabStatus} value="no" />
					Not fabricated
				</label>
				<br /><br />
				<legend><h3>Materials</h3></legend>
				{#each availableMaterials as material}
					<label>
						<input type="checkbox" bind:group={selectedMaterials} value={material} />
						{material}
					</label>
				{/each}
			</fieldset>

			<button type="submit">Filter</button>
		</form>
	</div>
</div>

{#if !graphInitialized}
	<p>Loading graph...</p>
{/if}

<style>
	.container {
		display: flex;
		width: 100%;
		height: 100%;
		flex: 1;
		overflow: hidden;
	}

	.graph {
		display: flex;
		justify-content: center;
		align-items: center;
		height: 100%;
		width: 100%;
		overflow: none;
	}

	.graph svg {
		display: block;
		max-width: 100%;
		max-height: 100%;
	}

	.sidebar {
		width: 20vw;
		background: white;
		border-left: 2px dotted black;
		padding: 20px;
		box-sizing: border-box;
		overflow-y: auto;
	}

	.sidebar form {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.sidebar fieldset {
		border: none;
		padding: 0;
	}

	.sidebar label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.sidebar button {
		margin-top: auto;
		align-self: flex-start;
		padding: 8px 16px;
		font-size: 1rem;
		cursor: pointer;
		align-self: center;
	}
</style>
