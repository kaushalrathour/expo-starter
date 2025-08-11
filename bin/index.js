#!/usr/bin/env node

const fs = require('fs-extra');
const path = require('path');
const { execa } = require('execa');
const chalk = require('chalk');
const os = require('os');

// Validation functions
const validateAppName = (name) => {
  // App name should be alphanumeric, can contain hyphens and underscores, 3-50 characters
  const appNameRegex = /^[a-zA-Z][a-zA-Z0-9_-]{2,49}$/;
  return appNameRegex.test(name);
};

const validatePackageName = (packageName) => {
  // Package name format: com.organization.appname (reverse domain notation)
  // Allow both 2-segment (com.appname) and 3+ segment (com.organization.appname) formats
  const packageRegex = /^[a-z][a-z0-9]*(\.([a-z][a-z0-9]*))+$/;
  return packageRegex.test(packageName);
};

const isTwoSegmentPackage = (packageName) => {
  // Check if package name has only two segments (com.appname)
  return packageName.split('.').length === 2;
};

const validateAppScheme = (scheme) => {
  // App scheme should be lowercase alphanumeric, can contain hyphens, 3-20 characters
  const schemeRegex = /^[a-z][a-z0-9-]{2,19}$/;
  return schemeRegex.test(scheme);
};

const validateDomain = (domain) => {
  // Domain validation: basic format check
  const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]?\.[a-zA-Z]{2,}(\.[a-zA-Z]{2,})*$/;
  return domainRegex.test(domain);
};

async function run() {
  const appName = process.argv[2];
  const packageName = process.argv[3]; // optional

  if (!appName) {
    console.error(chalk.red('❌ Please provide an app name.\nUsage: expo-starter AppName [com.organization.appname]'));
    process.exit(1);
  }

  // Validate app name
  if (!validateAppName(appName)) {
    console.error(chalk.red('❌ Invalid app name!'));
    console.error(chalk.yellow('App name must:'));
    console.error(chalk.yellow('  - Start with a letter'));
    console.error(chalk.yellow('  - Be 3-50 characters long'));
    console.error(chalk.yellow('  - Contain only letters, numbers, hyphens, and underscores'));
    console.error(chalk.gray('  Examples: MyApp, my-app, My_App_2024'));
    process.exit(1);
  }

  // Validate package name if provided
  if (packageName && !validatePackageName(packageName)) {
    console.error(chalk.red('❌ Invalid package name!'));
    console.error(chalk.yellow('Package name must:'));
    console.error(chalk.yellow('  - Use reverse domain notation'));
    console.error(chalk.yellow('  - Contain only lowercase letters and dots'));
    console.error(chalk.yellow('  - Have at least 2 segments'));
    console.error(chalk.gray('  Examples: com.company.appname, org.mycompany.myapp'));
    process.exit(1);
  }

  const cwd = process.cwd(); // Current working directory where command is run
  const appPath = path.join(cwd, appName);
  const templateDir = path.resolve(__dirname, '../overrides');

  try {
    // Step 1: Initialize Expo app
    console.log(chalk.cyan(`🚀 Initializing Expo app '${appName}'...`));

    await execa('npx', ['create-expo-app', appName], { cwd: cwd, stdio: 'inherit' });

    // Step 2: Remove files/folders to override
    console.log(chalk.cyan('🧹 Cleaning up default Expo files...'));
    const toRemove = ['App.tsx', 'README.md', 'babel.config.js', 'tsconfig.json', 'src', 'app', 'constants', 'components', 'hooks', 'scripts'];
    for (const item of toRemove) {
      const targetPath = path.join(appPath, item);
      try {
        if (await fs.pathExists(targetPath)) {
          await fs.remove(targetPath);
          console.log(chalk.gray(`   ✓ Removed ${item}`));
          
          // Verify deletion
          if (await fs.pathExists(targetPath)) {
            console.log(chalk.red(`   ❌ Failed to delete ${item} - still exists`));
          }
        } else {
          console.log(chalk.gray(`   - ${item} not found`));
        }
      } catch (error) {
        console.log(chalk.yellow(`   ⚠️  Failed to remove ${item}: ${error.message}`));
      }
    }

    // Step 3: Copy files from overrides/
    console.log(chalk.cyan('📋 Copying template files...'));
    await fs.copy(templateDir, appPath, { 
      overwrite: true, 
      recursive: true,
      filter: (src, dest) => {
        // Log what we're copying for debugging
        const relativePath = path.relative(templateDir, src);
        if (relativePath) {
          console.log(chalk.gray(`     Copying: ${relativePath}`));
        }
        return true;
      }
    });
    
    // Verify final state after copy
    const finalFiles = await fs.readdir(appPath);
    console.log(chalk.gray(`   ✓ Template files copied (${finalFiles.length} items total)`));
    
    // Double-check that unwanted directories are not present
    const unwantedDirs = ['app', 'components', 'constants', 'hooks', 'scripts'];
    for (const dir of unwantedDirs) {
      if (await fs.pathExists(path.join(appPath, dir))) {
        console.log(chalk.yellow(`   ⚠️  Warning: Unwanted directory '${dir}' still exists after template copy!`));
      }
    }

    // Step 3.5: Merge package.json scripts
    console.log(chalk.cyan('📝 Adding comprehensive npm scripts...'));
    const packageJsonPath = path.join(appPath, 'package.json');
    const scriptsTemplatePath = path.join(templateDir, 'package.json.template');
    
    if (await fs.pathExists(packageJsonPath) && await fs.pathExists(scriptsTemplatePath)) {
      const packageJson = await fs.readJson(packageJsonPath);
      const scriptsTemplate = await fs.readJson(scriptsTemplatePath);
      
      // Replace {{APP_NAME}} placeholder with actual app name
      let scriptsTemplateStr = JSON.stringify(scriptsTemplate);
      scriptsTemplateStr = scriptsTemplateStr.replace(/{{APP_NAME}}/g, appName);
      const processedScriptsTemplate = JSON.parse(scriptsTemplateStr);
      
      // Merge scripts, keeping existing ones and adding new ones
      packageJson.scripts = { ...packageJson.scripts, ...processedScriptsTemplate.scripts };
      
      // Add expo doctor configuration if present in template
      if (processedScriptsTemplate.expo) {
        packageJson.expo = { ...packageJson.expo, ...processedScriptsTemplate.expo };
      }
      
      await fs.writeJson(packageJsonPath, packageJson, { spaces: 2 });
      console.log(chalk.green('✅ Package configuration updated'));
    }

    // Step 4: Install dependency groups
    const group1 = [
      '@react-native-async-storage/async-storage',
      'react-native-size-matters',
      '@expo/vector-icons',
      'react-native-paper',
      'react-native-toast-message',
    ];

    const group2 = [
      '@react-navigation/native',
      '@react-navigation/stack',
      'react-native-gesture-handler',
      'react-native-reanimated',
      'react-native-safe-area-context',
      'react-native-screens',
    ];

    const group3 = [
      '@reduxjs/toolkit',
      'react-redux',
    ];

    // Step 4.5: Clean up Expo Router configuration from app.json
    console.log(chalk.cyan('🧹 Cleaning up Expo Router configuration...'));
    const appJsonPath = path.join(appPath, 'app.json');
    if (await fs.pathExists(appJsonPath)) {
      try {
        const appJson = await fs.readJson(appJsonPath);
        
        // Remove expo-router from plugins if it exists
        if (appJson.expo && appJson.expo.plugins) {
          appJson.expo.plugins = appJson.expo.plugins.filter(plugin => 
            plugin !== 'expo-router' && plugin !== 'expo-router/plugin'
          );
        }
        
        // Remove typedRoutes experiment if it exists
        if (appJson.expo && appJson.expo.experiments && appJson.expo.experiments.typedRoutes) {
          delete appJson.expo.experiments.typedRoutes;
          
          // Remove experiments object if it's now empty
          if (Object.keys(appJson.expo.experiments).length === 0) {
            delete appJson.expo.experiments;
          }
        }
        
        // Remove web configuration entirely (Android/iOS focused)
        if (appJson.expo && appJson.expo.web) {
          delete appJson.expo.web;
        }
        
        await fs.writeJson(appJsonPath, appJson, { spaces: 2 });
        console.log(chalk.green('✅ Expo Router configuration cleaned from app.json'));
      } catch (error) {
        console.log(chalk.yellow('⚠️  Could not clean app.json, continuing...'));
      }
    }

    // Step 5: Configure package name if provided
    let finalPackageName = packageName;
    if (packageName) {
      console.log(chalk.cyan(`📦 Configuring package name: ${packageName}...`));
      
      // Warn about 2-segment package names and iOS issues
      if (isTwoSegmentPackage(packageName)) {
        console.log(chalk.yellow('⚠️  WARNING: Two-segment package name detected!'));
        console.log(chalk.yellow('Package name "' + packageName + '" may cause issues with iOS development and deployment.'));
        console.log(chalk.yellow('Apple recommends using at least 3 segments (e.g., com.company.appname).'));
        console.log(chalk.gray('Issues you may encounter:'));
        console.log(chalk.gray('  - App Store submission problems'));
        console.log(chalk.gray('  - TestFlight distribution issues'));
        console.log(chalk.gray('  - Xcode signing complications'));
        
        const readline = require('readline');
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout
        });
        
        const askQuestion = (question) => {
          return new Promise((resolve) => {
            rl.question(question, (answer) => {
              resolve(answer.trim());
            });
          });
        };
        
        // Improved askQuestion with fallback handling for yes/no questions
        const askYesNoQuestion = async (question, validResponses = ['y', 'yes', 'n', 'no'], allowEmpty = true) => {
          let response;
          do {
            response = await askQuestion(question);
            
            // If empty response and allowed, break the loop
            if (!response && allowEmpty) {
              break;
            }
            
            // Check if response is valid
            if (response && validResponses.includes(response.toLowerCase())) {
              break;
            }
            
            // Invalid response, ask again
            if (response) {
              console.error(chalk.red('❌ Invalid response. Please answer with: ' + validResponses.join(', ')));
            }
          } while (response || !allowEmpty);
          
          return response;
        };
        
        const updatePackage = await askQuestion(chalk.cyan('Would you like to update your package name to avoid iOS issues? (y/N): '));
        
        if (updatePackage.toLowerCase() === 'y' || updatePackage.toLowerCase() === 'yes') {
          let newPackageName;
          do {
            const segments = packageName.split('.');
            const suggestedName = `${segments[0]}.company.${segments[1]}`;
            newPackageName = await askQuestion(chalk.cyan(`Enter a new package name (suggestion: ${suggestedName}): `));
            
            if (newPackageName && !validatePackageName(newPackageName)) {
              console.error(chalk.red('❌ Invalid package name format!'));
              console.error(chalk.yellow('Please use reverse domain notation (e.g., com.company.appname)'));
              newPackageName = null;
            } else if (newPackageName && isTwoSegmentPackage(newPackageName)) {
              console.error(chalk.yellow('⚠️  Still a 2-segment package name. Consider using 3+ segments.'));
              const keepAnyway = await askQuestion(chalk.cyan('Use this package name anyway? (y/N): '));
              if (keepAnyway.toLowerCase() !== 'y' && keepAnyway.toLowerCase() !== 'yes') {
                newPackageName = null;
              }
            }
          } while (newPackageName !== null && !validatePackageName(newPackageName));
          
          if (newPackageName) {
            finalPackageName = newPackageName;
            console.log(chalk.green(`✅ Updated package name to: ${finalPackageName}`));
          } else {
            console.log(chalk.gray('Keeping original package name...'));
          }
        } else {
          console.log(chalk.gray('Proceeding with 2-segment package name. You can change this later in app.json'));
        }
        
        rl.close();
      }
      
      const appJsonPath = path.join(appPath, 'app.json');
      if (await fs.pathExists(appJsonPath)) {
        const appJson = await fs.readJson(appJsonPath);
        
        // Update iOS bundle identifier
        if (!appJson.expo.ios) {
          appJson.expo.ios = {};
        }
        appJson.expo.ios.bundleIdentifier = finalPackageName;
        
        // Update Android package
        if (!appJson.expo.android) {
          appJson.expo.android = {};
        }
        appJson.expo.android.package = finalPackageName;
        
        await fs.writeJson(appJsonPath, appJson, { spaces: 2 });
        console.log(chalk.green(`✅ Updated bundle identifier and package to: ${finalPackageName}`));
      }
    }

    // Step 6: Configure app scheme and universal links
    console.log(chalk.cyan('🔗 Setting up deep linking configuration...'));
    
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    const askQuestion = (question) => {
      return new Promise((resolve) => {
        rl.question(question, (answer) => {
          resolve(answer.trim());
        });
      });
    };
    
    // Improved askQuestion with fallback handling for yes/no questions
    const askYesNoQuestion = async (question, validResponses = ['y', 'yes', 'n', 'no'], allowEmpty = true) => {
      let response;
      do {
        response = await askQuestion(question);
        
        // If empty response and allowed, break the loop
        if (!response && allowEmpty) {
          break;
        }
        
        // Check if response is valid
        if (response && validResponses.includes(response.toLowerCase())) {
          break;
        }
        
        // Invalid response, ask again
        if (response) {
          console.error(chalk.red('❌ Invalid response. Please answer with: ' + validResponses.join(', ')));
        }
      } while (response || !allowEmpty);
      
      return response;
    };
    
    const configureAppScheme = await askYesNoQuestion(chalk.cyan('📱 Do you want to configure a custom app scheme for deep linking? (y/N): '));
    let appScheme = null;
    let universalLinkDomain = null;
    
    if (configureAppScheme.toLowerCase() === 'y' || configureAppScheme.toLowerCase() === 'yes') {
      // Validate app scheme with retry logic
      do {
        appScheme = await askQuestion(chalk.cyan(`🔤 Enter your app scheme (e.g., "${appName.toLowerCase()}", "myapp"): `));
        
        if (appScheme && !validateAppScheme(appScheme)) {
          console.error(chalk.red('❌ Invalid app scheme!'));
          console.error(chalk.yellow('App scheme must:'));
          console.error(chalk.yellow('  - Start with a letter'));
          console.error(chalk.yellow('  - Be 3-20 characters long'));
          console.error(chalk.yellow('  - Contain only lowercase letters, numbers, and hyphens'));
          console.error(chalk.gray(`  Examples: ${appName.toLowerCase()}, myapp, my-app`));
          appScheme = null; // Reset to retry
        }
      } while (appScheme && !validateAppScheme(appScheme));
      
      if (appScheme) {
        const configureUniversalLinks = await askYesNoQuestion(chalk.cyan('🌐 Do you want to configure universal links? (y/N): '));
        
        if (configureUniversalLinks.toLowerCase() === 'y' || configureUniversalLinks.toLowerCase() === 'yes') {
          // Validate domain with retry logic
          do {
            universalLinkDomain = await askQuestion(chalk.cyan(`🔗 Enter your domain for universal links (e.g., "${appName.toLowerCase()}.com", "myapp.com"): `));
            
            if (universalLinkDomain && !validateDomain(universalLinkDomain)) {
              console.error(chalk.red('❌ Invalid domain!'));
              console.error(chalk.yellow('Domain must:'));
              console.error(chalk.yellow('  - Be a valid domain format'));
              console.error(chalk.yellow('  - Include a top-level domain (.com, .org, etc.)'));
              console.error(chalk.gray(`  Examples: ${appName.toLowerCase()}.com, mycompany.org, app.example.io`));
              universalLinkDomain = null; // Reset to retry
            }
          } while (universalLinkDomain && !validateDomain(universalLinkDomain));
        }
        
        console.log(chalk.cyan('⚙️  Configuring deep linking...'));
        // Update app.json with scheme and universal link configuration
        const appJsonPath = path.join(appPath, 'app.json');
        if (await fs.pathExists(appJsonPath)) {
          const appJson = await fs.readJson(appJsonPath);
          
          // Add scheme to root level
          appJson.expo.scheme = appScheme;
          
          // Configure Android intent filters
          if (!appJson.expo.android) {
            appJson.expo.android = {};
          }
          
          const intentFilters = [];
          
          // Add universal link intent filter if domain provided
          if (universalLinkDomain) {
            intentFilters.push({
              "action": "VIEW",
              "autoVerify": true,
              "data": [
                { "scheme": "https", "host": universalLinkDomain }
              ],
              "category": ["BROWSABLE", "DEFAULT"]
            });
          }
          
          // Add custom scheme intent filter
          intentFilters.push({
            "action": "VIEW",
            "data": [
              { "scheme": appScheme }
            ],
            "category": ["BROWSABLE", "DEFAULT"]
          });
          
          // Merge with existing intent filters if any
          if (appJson.expo.android.intentFilters && Array.isArray(appJson.expo.android.intentFilters)) {
            appJson.expo.android.intentFilters = [...appJson.expo.android.intentFilters, ...intentFilters];
          } else {
            appJson.expo.android.intentFilters = intentFilters;
          }
          
          // Configure iOS associated domains
          if (universalLinkDomain) {
            if (!appJson.expo.ios) {
              appJson.expo.ios = {};
            }
            
            const associatedDomain = `applinks:${universalLinkDomain}`;
            
            if (appJson.expo.ios.associatedDomains && Array.isArray(appJson.expo.ios.associatedDomains)) {
              if (!appJson.expo.ios.associatedDomains.includes(associatedDomain)) {
                appJson.expo.ios.associatedDomains.push(associatedDomain);
              }
            } else {
              appJson.expo.ios.associatedDomains = [associatedDomain];
            }
          }
          
          await fs.writeJson(appJsonPath, appJson, { spaces: 2 });
          console.log(chalk.green('✅ Deep linking configuration added to app.json'));
          
          if (appScheme) {
            console.log(chalk.gray(`   📱 App scheme: ${appScheme}://`));
          }
          if (universalLinkDomain) {
            console.log(chalk.gray(`   🌐 Universal links: https://${universalLinkDomain}`));
          }
        }
      }
    }
    
    // Step 7: Generate native directories if requested
    const generateNative = await askYesNoQuestion(chalk.cyan('📱 Do you want to generate native Android/iOS directories (expo prebuild)? (y/N): '));
    
    if (generateNative.toLowerCase() === 'y' || generateNative.toLowerCase() === 'yes') {
      // Ask which platforms to prebuild
      const platformChoice = await askQuestion(chalk.cyan('📋 Which platforms to prebuild?\n  1. Both Android and iOS (default)\n  2. Android only\n  3. iOS only\nEnter choice (1-3): '));
      
      let platforms = [];
      switch (platformChoice.trim()) {
        case '2':
          platforms = ['--platform', 'android'];
          console.log(chalk.cyan('📱 Generating Android directory...'));
          break;
        case '3':
          platforms = ['--platform', 'ios'];
          console.log(chalk.cyan('🍎 Generating iOS directory...'));
          break;
        case '1':
        default:
          platforms = []; // Both platforms (default behavior)
          console.log(chalk.cyan('📱 Generating Android and iOS directories...'));
          break;
      }
      
      try {
        // Run expo prebuild to generate native directories
        await execa('npx', ['expo', 'prebuild', '--clean', ...platforms], { 
          cwd: appPath, 
          stdio: 'inherit' 
        });
        
        console.log(chalk.green('✅ Native directories generated successfully!'));
        
        // Check which directories were created and provide feedback
        const androidExists = await fs.pathExists(path.join(appPath, 'android'));
        const iosExists = await fs.pathExists(path.join(appPath, 'ios'));
        
        if (androidExists) {
          console.log(chalk.gray('   📱 Android directory created'));
        }
        if (iosExists) {
          console.log(chalk.gray('   🍎 iOS directory created'));
        }
        
        // Auto-install CocoaPods if iOS directory was created on macOS
        if (iosExists && os.platform() === 'darwin') {
          console.log(chalk.yellow('\n🍎 iOS directory detected - CocoaPods installation recommended'));
          
          const installPods = await askYesNoQuestion(chalk.cyan('📱 Install CocoaPods dependencies now? (Y/n): '), ['y', 'yes', 'n', 'no'], true);
          
          if (installPods.toLowerCase() !== 'n' && installPods.toLowerCase() !== 'no') {
            try {
              console.log(chalk.cyan('\n📦 Installing CocoaPods dependencies...'));
              await execa('npx', ['pod-install'], { cwd: appPath, stdio: 'inherit' });
              console.log(chalk.green('✅ CocoaPods installation completed!'));
            } catch (error) {
              console.log(chalk.red('❌ CocoaPods installation failed. You can run it manually later:'));
              console.log(chalk.yellow('npx pod-install'));
            }
          }
        }
        
      } catch (error) {
        console.log(chalk.red('❌ Failed to generate native directories:'), error.message);
        console.log(chalk.yellow('You can generate them manually later with: npx expo prebuild'));
      }
    }
    
    // Step 8: Configure git repository with custom initial commit
    console.log(chalk.cyan('📋 Setting up git repository...'));
    
    try {
      // Reset the git repository to remove Expo's initial commit
      await execa('git', ['reset', '--hard'], { cwd: appPath, stdio: 'pipe' });
      
      // Remove all existing commits and start fresh
      await execa('git', ['update-ref', '-d', 'HEAD'], { cwd: appPath, stdio: 'pipe' });
      
      // Add all files to git
      await execa('git', ['add', '.'], { cwd: appPath, stdio: 'pipe' });
      
      // Create new initial commit with our custom message
      const commitConfigDetails = [];
      if (finalPackageName) {
        commitConfigDetails.push(`📦 Package: ${finalPackageName}`);
      }
      if (appScheme) {
        commitConfigDetails.push(`🔗 App Scheme: ${appScheme}://`);
      }
      if (universalLinkDomain) {
        commitConfigDetails.push(`🌐 Universal Links: https://${universalLinkDomain}`);
      }
      
      const configSection = commitConfigDetails.length > 0 
        ? `\n\n⚙️ Configuration:\n${commitConfigDetails.join('\n')}`
        : '';
      
      const commitMessage = `🎆 Initial commit: ${appName}

🚀 Generated and configured with expo-starter
✨ Includes: Navigation, Redux, UI components, build scripts, and more!
${configSection}

📎 Template: @kaushalrathour/expo-starter
🔗 Repository: https://github.com/kaushalrathour/expo-starter

💡 Use 'npx @kaushalrathour/expo-starter' for latest version`;
      
      await execa('git', ['commit', '-m', commitMessage], { cwd: appPath, stdio: 'pipe' });
      
      console.log(chalk.green('✅ Git repository configured with custom initial commit'));
    } catch (error) {
      console.log(chalk.yellow('⚠️  Git configuration failed (this is optional):'), error.message);
      console.log(chalk.gray('   You can manually configure git later'));
    }
    
    // Step 9: Clean up template files
    console.log(chalk.cyan('🧹 Cleaning up template files...'));
    const packageJsonTemplatePath = path.join(appPath, 'package.json.template');
    if (await fs.pathExists(packageJsonTemplatePath)) {
      await fs.remove(packageJsonTemplatePath);
      console.log(chalk.gray('   ✓ Removed package.json.template'));
    }
    
    // Step 10: Final cleanup - Remove any directories that may have been regenerated by npm/expo
    console.log(chalk.cyan('🧹 Final cleanup of regenerated files...'));
    const finalToRemove = ['app', 'constants', 'components', 'hooks', 'scripts'];
    let removedInFinalCleanup = 0;
    for (const item of finalToRemove) {
      const targetPath = path.join(appPath, item);
      try {
        if (await fs.pathExists(targetPath)) {
          await fs.remove(targetPath);
          console.log(chalk.gray(`   ✓ Final cleanup: Removed ${item}`));
          removedInFinalCleanup++;
        }
      } catch (error) {
        console.log(chalk.yellow(`   ⚠️  Failed to remove ${item} in final cleanup: ${error.message}`));
      }
    }
    
    if (removedInFinalCleanup > 0) {
      console.log(chalk.yellow(`   📝 Note: ${removedInFinalCleanup} directories were regenerated by npm/Expo and have been removed`));
    } else {
      console.log(chalk.gray('   ✓ No files needed final cleanup'));
    }
    
    // Step 11: Set final package.json main entry point to index.ts
    console.log(chalk.cyan('📝 Setting final entry point configuration...'));
    const finalPackageJsonPath = path.join(appPath, 'package.json');
    if (await fs.pathExists(finalPackageJsonPath)) {
      const finalPackageJson = await fs.readJson(finalPackageJsonPath);
      
      // Set main entry point to index.ts instead of expo-router/entry
      finalPackageJson.main = 'index.ts';
      
      await fs.writeJson(finalPackageJsonPath, finalPackageJson, { spaces: 2 });
      console.log(chalk.green('✅ Entry point set to index.ts'));
    }
    
    // Step 12: Install all dependencies after user questions are complete
    console.log(chalk.cyan('\n📦 Installing all project dependencies...'));
    
    console.log(chalk.green(`Installing UI & utility dependencies: ${group1.join(', ')}...`));
    await execa('npx', ['expo', 'install', ...group1], { cwd: appPath, stdio: 'inherit' });

    console.log(chalk.green(`Installing navigation dependencies: ${group2.join(', ')}...`));
    await execa('npx', ['expo', 'install', ...group2], { cwd: appPath, stdio: 'inherit' });

    console.log(chalk.green(`Installing state management dependencies: ${group3.join(', ')}...`));
    await execa('npx', ['expo', 'install', ...group3], { cwd: appPath, stdio: 'inherit' });
    
    console.log(chalk.green('\n✅ All dependencies installed successfully!'));
    
    console.log(chalk.green(`\n✅ Project '${appName}' is ready! 🚀`));

    // Change to project directory
    process.chdir(appPath);
    console.log(chalk.cyan(`\n📁 Changed to project directory: ${appName}`));
    
    const dirContents = await fs.readdir(appPath);
    console.log(chalk.cyan('Project contents:'));
    dirContents.forEach(item => console.log('  -', item));

    rl.close();

    // Provide user instructions
    console.log(chalk.yellow(`\n🚀 Next steps:`));
    console.log(chalk.yellow(`1. To start development server: npm start`));
    console.log(chalk.yellow(`2. To run on iOS: npm run ios`));
    console.log(chalk.yellow(`3. To run on Android: npm run android`));
    console.log(chalk.yellow(`4. To run on Web: npm run web`));
    
    console.log(chalk.cyan(`\n🏢 EAS Build Commands:`));
    console.log(chalk.gray(`• Development build: npm run build:development`));
    console.log(chalk.gray(`• Preview build: npm run build:preview`));
    console.log(chalk.gray(`• Production build: npm run build:production`));
    console.log(chalk.gray(`• Submit to stores: npm run submit:production`));
    
    console.log(chalk.cyan(`\n📋 Troubleshooting Pod Install Issues:`));
    console.log(chalk.gray(`If you encounter 'RNWorklets' dependency errors during pod install:`));
    console.log(chalk.gray(`• This template uses react-native-reanimated@3.19.0 to avoid compatibility issues`));
    console.log(chalk.gray(`• If errors persist, try: cd ios && pod install --repo-update`));
    console.log(chalk.gray(`• For other dependency conflicts, check: https://github.com/software-mansion/react-native-reanimated/issues`));
  } catch (err) {
    console.error(chalk.red('❌ An error occurred:'), err);
    process.exit(1);
  }
}

run();
