#!/usr/bin/env node

import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

function fail( message ) {
	console.error( `[measure-next-route-client-bundle] ${ message }` );
	process.exit( 1 );
}

function optionValue( name ) {
	const index = process.argv.indexOf( name );
	return index >= 0 ? process.argv[ index + 1 ] : '';
}

const buildDirectory = path.resolve(
	optionValue( '--build-dir' ) || 'frontend/.next'
);
const route = optionValue( '--route' );

if ( ! route?.startsWith( '/' ) || route.includes( '..' ) ) {
	fail(
		'pass a normalized app route with --route, for example /admin/accounts'
	);
}

const routePath = route === '/' ? '' : route;
const manifestPath = path.join(
	buildDirectory,
	'server',
	'app',
	routePath,
	'page_client-reference-manifest.js'
);
const manifestSource = await readFile( manifestPath, 'utf8' ).catch( () => '' );
const assignment = manifestSource.match( /= (\{.*\});\s*$/s );

if ( ! assignment ) {
	fail( `could not parse ${ manifestPath }` );
}

const manifest = JSON.parse( assignment[ 1 ] );
const entryKey = `[project]/frontend/src/app${ routePath }/page`;
const chunkPaths = [
	...new Set( manifest.entryJSFiles?.[ entryKey ] || [] ),
].sort();

if ( chunkPaths.length === 0 ) {
	fail( `no client entry chunks found for ${ entryKey }` );
}

const chunks = [];
for ( const chunkPath of chunkPaths ) {
	const absolutePath = path.join( buildDirectory, chunkPath );
	const contents = await readFile( absolutePath );
	const details = await stat( absolutePath );
	chunks.push( {
		path: chunkPath,
		bytes: details.size,
		gzip_bytes: gzipSync( contents ).length,
	} );
}

const totals = chunks.reduce(
	( current, chunk ) => ( {
		bytes: current.bytes + chunk.bytes,
		gzip_bytes: current.gzip_bytes + chunk.gzip_bytes,
	} ),
	{ bytes: 0, gzip_bytes: 0 }
);

console.log(
	JSON.stringify(
		{
			route,
			build_directory: buildDirectory,
			chunk_count: chunks.length,
			...totals,
			chunks,
		},
		null,
		2
	)
);
