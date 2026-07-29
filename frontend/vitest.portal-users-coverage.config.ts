import { defineConfig, mergeConfig } from 'vitest/config';

import baseConfig from './vitest.config';

export default mergeConfig(
	baseConfig,
	defineConfig( {
		test: {
			coverage: {
				provider: 'v8',
				include: [
					'src/components/admin/AdminQueryProvider.tsx',
					'src/features/admin/portal-users/**/*.{ts,tsx}',
				],
				reporter: [ 'text', 'json-summary' ],
				reportsDirectory: 'coverage/portal-users',
			},
		},
	} )
);
