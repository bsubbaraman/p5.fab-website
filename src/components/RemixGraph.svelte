<script>
	import { onMount } from 'svelte';
	import * as d3 from 'd3';
	import { store } from '../store/state.svelte.js';
	import { getPostFromDB } from '$lib/dbLoadSave.js';

	let { objectID } = $props();
	let graphInitialized = $state(false);
	let container;

	// Graph Variables
	let graphData = $state({
		nodes: [],
		links: []
	});
	const graphDist = 100; // distance between nodes
	const nodeSize = 75; // how big nodes are rendered

	// Filter Variables
	let availableMaterials = $state([]);
	let selectedMaterials = $state([]);
	let selectedFabStatus = $state([]);

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

		const color = d3.scaleOrdinal(d3.schemeTableau10);
		const simulation = d3
			.forceSimulation(clonedGraphData.nodes)
			.force(
				'link',
				d3
					.forceLink(clonedGraphData.links)
					.id((d) => d.id)
					.distance(graphDist)
			)
			.force('charge', d3.forceManyBody().strength(-2000))
			.force('center', d3.forceCenter(width / 2, height / 2))
			.force('collide', d3.forceCollide().radius(nodeSize).iterations(2));

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

		const link = svg
			.append('g')
			.attr('stroke', '#000')
			.attr('stroke-opacity', 1)
			.selectAll('line')
			.data(clonedGraphData.links)
			.join('line')
			.attr('stroke-width', 2)
			.attr('marker-end', 'url(#arrow)');

		const defs = svg.append('defs');

		defs
			.selectAll('clipPath')
			.data(clonedGraphData.nodes)
			.join('clipPath')
			.attr('id', (d) => `clip-${d.id}`)
			.append('circle')
			.attr('r', nodeSize / 2) // same radius as the border
			.attr('cx', 0)
			.attr('cy', 0);

		const node = svg
			.append('g')
			.selectAll('g')
			.data(clonedGraphData.nodes)
			.join('g')
			.call(drag(simulation));

		// Border circle
		node
			.append('circle')
			.attr('r', nodeSize / 2 + 2) // slightly bigger for border
			.attr('fill', 'none')
			.attr('stroke', 'black')
			.attr('stroke-width', 2);

		// Image with clipPath
		node
			.append('image')
			.attr('xlink:href', (d) => d.img || 'https://via.placeholder.com/40')
			.attr('width', nodeSize)
			.attr('height', nodeSize)
			.attr('x', -nodeSize / 2)
			.attr('y', -nodeSize / 2)
			.attr('clip-path', (d) => `url(#clip-${d.id})`);

		node
			.on('mouseover', (event, d) => {
				tooltip.style('opacity', 1).html(`<b>${d.name}</b><br/>by <b>${d.username}</b>`);
			})
			.on('mousemove', (event) => {
				tooltip.style('left', event.pageX + 25 + 'px').style('top', event.pageY + 'px');
			})
			.on('mouseout', () => {
				tooltip.style('opacity', 0);
			})
			.on('click', (event, d) => {
				const url = `/fabs/${d.id}`;
				window.open(url, '_blank'); // open in new tab
			});
		node.style('cursor', 'pointer');

		// node.append('title').text((d) => d.name);

		// tooltip container
		const tooltip = d3
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

		simulation.on('tick', () => {
			link
				.attr('x1', (d) => {
					const dx = d.target.x - d.source.x;
					const dy = d.target.y - d.source.y;
					const dist = Math.sqrt(dx * dx + dy * dy);
					const r = nodeSize / 2 + 2; // radius + border
					return d.source.x + (dx / dist) * r;
				})
				.attr('y1', (d) => {
					const dx = d.target.x - d.source.x;
					const dy = d.target.y - d.source.y;
					const dist = Math.sqrt(dx * dx + dy * dy);
					const r = nodeSize / 2 + 2;
					return d.source.y + (dy / dist) * r;
				})
				.attr('x2', (d) => {
					const dx = d.target.x - d.source.x;
					const dy = d.target.y - d.source.y;
					const dist = Math.sqrt(dx * dx + dy * dy);
					const r = nodeSize / 2 + 2;
					return d.target.x - (dx / dist) * r;
				})
				.attr('y2', (d) => {
					const dx = d.target.x - d.source.x;
					const dy = d.target.y - d.source.y;
					const dist = Math.sqrt(dx * dx + dy * dy);
					const r = nodeSize / 2 + 2;
					return d.target.y - (dy / dist) * r;
				});

			// Constrain nodes within a circle
			const boundaryRadius = 215;
    node.each(function(d) {
        const dx = d.x - width / 2;
        const dy = d.y - height / 2;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > boundaryRadius) {
            d.x = width / 2 + (dx / dist) * boundaryRadius;
            d.y = height / 2 + (dy / dist) * boundaryRadius;
        }
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
			return d3.drag().on('start', dragstarted).on('drag', dragged).on('end', dragended);
		}
	}

	function findConnectedPosts(postID) {
		const allPostsData = Object.entries(store.allPostsData).map(([id, post]) => ({
			id,
			img: post.thumbnail || null,
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
		// Step 1: Get connected posts
		const connectedPosts = findConnectedPosts(objectID);

		// Step 2: Format as graphData
		const formatted = formatGraphData(connectedPosts);
		renderGraph(formatted);
		extractAvailableMaterials(formatted.nodes);

		// Can't assign reactive state object directly?
		// Assign nodes and links individually instead
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

	$effect(() => {
		if (store.allPostsData && !graphInitialized) {
			makeRemixGraph().then(() => {
				graphInitialized = true;
			});
		}
	});

	onMount(() => {
		// makeGraph();
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
		height: 100vh;
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
