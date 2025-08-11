#!/usr/bin/env node

const fs = require('fs-extra');
const path = require('path');
const { execa } = require('execa');
const chalk = require('chalk');
const os = require('os');

async function run() {
  const appName = process.argv[2];
  const packageName = process.argv[3]; // optional

  if (!appName) {
    console.error(chalk.red('❌ Please provide an app name.\nUsage: expo-starter AppName [com.organization.appname]'));
    process.exit(1);
  }

  const cwd = process.cwd(); // Current working directory where command is run
  const appPath = path.join(cwd, appName);
  const templateDir = path.resolve(__dirname, '../overrides');

  try {
    // Step 1: Initialize Expo app
    console.log(chalk.cyan(`🚀 Initializing Expo app '${appName}'...`));

    await execa('npx', ['expo', 'create', appName], { cwd: cwd, stdio: 'inherit' });

    // Step 2: Remove files/folders to override
    console.log(chalk.cyan('🔧 Setting up custom template files...'));
    const toRemove = ['App.tsx', 'README.md', 'babel.config.js', 'assets', 'src', 'app', 'constants', 'hooks', 'scripts'];
    for (const item of toRemove) {
      const targetPath = path.join(appPath, item);
      if (await fs.pathExists(targetPath)) {
        await fs.remove(targetPath);
      }
    }

    // Step 3: Copy files from overrides/
    await fs.copy(templateDir, appPath, { overwrite: true, recursive: true });

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
      console.log(chalk.green('✅ Added comprehensive npm scripts and expo configuration to package.json'));
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
      'react-native-reanimated@3.19.0',
      'react-native-safe-area-context',
      'react-native-screens',
    ];

    const group3 = [
      'react-native-dotenv',
      '@reduxjs/toolkit',
      'react-redux',
    ];

    console.log(chalk.green(`📦 Installing UI & utility dependencies: ${group1.join(', ')}...`));
    await execa('npm', ['install', ...group1], { cwd: appPath, stdio: 'inherit' });

    console.log(chalk.green(`📦 Installing navigation dependencies: ${group2.join(', ')}...`));
    await execa('npm', ['install', ...group2], { cwd: appPath, stdio: 'inherit' });

    console.log(chalk.green(`📦 Installing state management dependencies: ${group3.join(', ')}...`));
    await execa('npm', ['install', ...group3], { cwd: appPath, stdio: 'inherit' });

    // Step 5: Configure package name if provided
    if (packageName) {
      console.log(chalk.cyan(`📦 Configuring package name: ${packageName}...`));
      
      const appJsonPath = path.join(appPath, 'app.json');
      if (await fs.pathExists(appJsonPath)) {
        const appJson = await fs.readJson(appJsonPath);
        
        // Update iOS bundle identifier
        if (!appJson.expo.ios) {
          appJson.expo.ios = {};
        }
        appJson.expo.ios.bundleIdentifier = packageName;
        
        // Update Android package
        if (!appJson.expo.android) {
          appJson.expo.android = {};
        }
        appJson.expo.android.package = packageName;
        
        await fs.writeJson(appJsonPath, appJson, { spaces: 2 });
        console.log(chalk.green(`✅ Updated bundle identifier and package to: ${packageName}`));
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
    
    const configureAppScheme = await askQuestion(chalk.cyan('📱 Do you want to configure a custom app scheme for deep linking? (y/N): '));
    let appScheme = null;
    let universalLinkDomain = null;
    
    if (configureAppScheme.toLowerCase() === 'y' || configureAppScheme.toLowerCase() === 'yes') {
      appScheme = await askQuestion(chalk.cyan('🔤 Enter your app scheme (e.g., "myapp", "sunrise"): '));
      
      if (appScheme) {
        const configureUniversalLinks = await askQuestion(chalk.cyan('🌐 Do you want to configure universal links? (y/N): '));
        
        if (configureUniversalLinks.toLowerCase() === 'y' || configureUniversalLinks.toLowerCase() === 'yes') {
          universalLinkDomain = await askQuestion(chalk.cyan('🔗 Enter your domain for universal links (e.g., "myapp.com", "sunrise-trade.myshopify.com"): '));
        }
        
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
    const generateNative = await askQuestion(chalk.cyan('📱 Do you want to generate native Android/iOS directories (expo prebuild)? (y/N): '));
    
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
          
          const installPods = await askQuestion(chalk.cyan('📱 Install CocoaPods dependencies now? (Y/n): '));
          
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
