// Restricted Windows environments may not allow esbuild's child process.
// This equivalent production build uses TypeScript in-process and Rollup.
import { build } from 'vite';
import ts from 'typescript';
await build({configFile:false,resolve:{preserveSymlinks:true},esbuild:false,plugins:[{name:'typescript-in-process',enforce:'pre',transform(source,id){if(!/\.[cm]?[tj]sx?$/.test(id))return;source=source.replaceAll('process.env.NODE_ENV','"production"');return {code:id.includes('node_modules')?source:ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText,map:null};}}],build:{emptyOutDir:false,minify:false,cssMinify:false}});
