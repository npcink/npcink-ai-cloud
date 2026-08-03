#!/usr/bin/env node
/* eslint-disable no-console */

const assert = require( 'assert' );
const fs = require( 'fs' );
const path = require( 'path' );

const {
	checkCloudAntiDrift,
	selectDiscoveredContractPath,
} = require( './check-cloud-anti-drift.js' );

const cloudRoot = path.resolve( __dirname, '..' );
const tempRoot = path.join( cloudRoot, '.tmp', 'anti-drift-test' );
const contractPath = path.join( tempRoot, 'task-contract-anti-drift-test.json' );
const hardcodedAdminFile = path.join(
	cloudRoot,
	'frontend',
	'src',
	'app',
	'admin',
	'__anti_drift_tmp__',
	'page.tsx'
);
const projectedPortalFile = path.join(
	cloudRoot,
	'frontend',
	'src',
	'app',
	'portal',
	'__anti_drift_tmp__',
	'page.tsx'
);
const testFixtureFile = path.join(
	tempRoot,
	'tests',
	'assertions',
	'metadata-projection.test.ts'
);

function writeFile( filePath, contents ) {
	fs.mkdirSync( path.dirname( filePath ), { recursive: true } );
	fs.writeFileSync( filePath, contents );
}

function relativeToCloudRoot( filePath ) {
	return path.relative( cloudRoot, filePath ).replace( /\\/gu, '/' );
}

function hasViolations( result ) {
	return Object.values( result.violations ).some( ( items ) => items.length > 0 );
}

try {
	assert.strictEqual(
		selectDiscoveredContractPath( [ 'README.md', 'package.json' ] ),
		path.join( cloudRoot, 'config', 'cloud-anti-drift-default-contract-v1.json' )
	);
	assert.strictEqual(
		selectDiscoveredContractPath( [
			'README.md',
			'task-contract-current-work.json',
		] ),
		path.join( cloudRoot, 'task-contract-current-work.json' )
	);
	assert.throws(
		() =>
			selectDiscoveredContractPath( [
				'task-contract-a.json',
				'task-contract-b.json',
			] ),
		/Multiple root task contracts found.*pass --contract/u
	);

	writeFile(
		contractPath,
		JSON.stringify(
			{
				change_classification: 'cloud detail',
				truth_owner: 'cloud read-only metadata projection',
				final_write_owner: 'wordpress_local',
				fail_closed_expectation: 'block page-local metadata drift',
				human_review_required: false,
				required_docs: [],
				required_gates: [],
			},
			null,
			2
		)
	);

	writeFile(
		hardcodedAdminFile,
		"export const agentId = 'internal_ops_advisor_agent';\n"
	);
	const hardcodedResult = checkCloudAntiDrift( {
		contractPath,
		files: [ relativeToCloudRoot( hardcodedAdminFile ) ],
	} );
	assert.strictEqual( hardcodedResult.is_cloud_task, true );
	assert.strictEqual(
		hardcodedResult.contract_path,
		relativeToCloudRoot( contractPath )
	);
	assert.match(
		hardcodedResult.violations.metadata_projection_hardcoding.join( '\n' ),
		/internal_ops_advisor_agent/u
	);

	writeFile(
		projectedPortalFile,
		"export const metadata = response.agent_metadata_projection;\n"
	);
	const projectedResult = checkCloudAntiDrift( {
		contractPath,
		files: [ relativeToCloudRoot( projectedPortalFile ) ],
	} );
	assert.strictEqual( hasViolations( projectedResult ), false );
	assert.deepStrictEqual(
		projectedResult.violations.metadata_projection_boundary_doc_missing,
		[]
	);

	writeFile(
		testFixtureFile,
		"assert.equal(data.workflow_id, 'external_web_evidence_preflight');\n"
	);
	const testResult = checkCloudAntiDrift( {
		contractPath,
		files: [ relativeToCloudRoot( testFixtureFile ) ],
	} );
	assert.strictEqual( hasViolations( testResult ), false );

	const defaultContractResult = checkCloudAntiDrift( {
		contractPath: '',
		files: [ 'scripts/check-cloud-anti-drift.js' ],
	} );
	assert.strictEqual(
		defaultContractResult.contract_path,
		'config/cloud-anti-drift-default-contract-v1.json'
	);
	assert.strictEqual( hasViolations( defaultContractResult ), false );
	const defaultExecutableResult = checkCloudAntiDrift( {
		contractPath: '',
		files: [ 'app/example.py', 'tests/example.py' ],
	} );
	assert.deepStrictEqual(
		defaultExecutableResult.violations.missing_required_gates,
		[]
	);

	const missingContractResult = checkCloudAntiDrift( {
		contractPath: path.join( tempRoot, 'missing-task-contract.json' ),
		files: [ 'README.md' ],
	} );
	assert.deepStrictEqual(
		missingContractResult.violations.missing_contract_fields,
		[ 'task_contract_required_for_cloud_changes' ]
	);

	console.log(
		'[ok] cloud anti-drift contract discovery and metadata projection tests passed.'
	);
} finally {
	fs.rmSync( path.dirname( hardcodedAdminFile ), { recursive: true, force: true } );
	fs.rmSync( path.dirname( projectedPortalFile ), { recursive: true, force: true } );
	fs.rmSync( tempRoot, { recursive: true, force: true } );
}
