class ASFParser {
    constructor() {
        this.skeleton = {
            version: '',
            name: '',
            units: {},
            documentation: '',
            root: {},
            bones: {},
            hierarchy: {}
        };
    }

    parse(content) {
        const lines = content.split('\n').map(line => line.trim());
        let currentSection = '';
        let currentBone = null;

        for (let line of lines) {
            // Skip empty lines and comments
            if (line === '' || line.startsWith('#')) continue;

            // Check if this is a section header
            if (line.startsWith(':')) {
                currentSection = line.substring(1);
                continue;
            }

            switch (currentSection) {
                case 'version':
                    this.skeleton.version = line;
                    break;

                case 'name':
                    this.skeleton.name = line;
                    break;

                case 'units':
                    if (line.includes(' ')) {
                        const [key, value] = line.trim().split(/\s+/);
                        this.skeleton.units[key] = value;
                    }
                    break;

                case 'documentation':
                    this.skeleton.documentation += line + '\n';
                    break;

                case 'root':
                    if (line.includes(' ')) {
                        const [key, ...values] = line.trim().split(/\s+/);
                        this.skeleton.root[key] = values;
                    }
                    break;

                case 'bonedata':
                    this.parseBoneData(line, currentBone);
                    if (line === 'begin') {
                        currentBone = {};
                    } else if (line === 'end') {
                        if (currentBone && currentBone.name) {
                            this.skeleton.bones[currentBone.name] = currentBone;
                        }
                        currentBone = null;
                    }
                    break;

                case 'hierarchy':
                    if (line === 'begin' || line === 'end') continue;
                    this.parseHierarchy(line);
                    break;
            }
        }

        return this.skeleton;
    }

    parseBoneData(line, currentBone) {
        if (!currentBone || line === 'begin' || line === 'end') return;

        const parts = line.trim().split(/\s+/);
        const key = parts[0];

        switch (key) {
            case 'id':
                currentBone.id = parseInt(parts[1]);
                break;

            case 'name':
                currentBone.name = parts[1];
                break;

            case 'direction':
                currentBone.direction = {
                    x: parseFloat(parts[1]),
                    y: parseFloat(parts[2]),
                    z: parseFloat(parts[3])
                };
                break;

            case 'length':
                currentBone.length = parseFloat(parts[1]);
                break;

            case 'axis':
                currentBone.axis = {
                    x: parseFloat(parts[1]),
                    y: parseFloat(parts[2]),
                    z: parseFloat(parts[3]),
                    order: parts[4]
                };
                break;

            case 'dof':
                currentBone.dof = parts.slice(1);
                break;

            case 'limits':
                if (!currentBone.limits) currentBone.limits = [];
                // Handle limits that might span multiple lines
                const limitPairs = line.match(/\(([-\d.]+)\s+([-\d.]+)\)/g);
                if (limitPairs) {
                    limitPairs.forEach(pair => {
                        const [min, max] = pair.slice(1, -1).split(/\s+/).map(Number);
                        currentBone.limits.push({ min, max });
                    });
                }
                break;
        }
    }

    parseHierarchy(line) {
        const parts = line.trim().split(/\s+/);
        const parent = parts[0];
        const children = parts.slice(1);
        this.skeleton.hierarchy[parent] = children;
    }
}

// Helper function to create a flat array of bones with their world positions
function calculateBonePositions(skeleton) {
    const positions = new Map();
    const bones = skeleton.bones;
    const hierarchy = skeleton.hierarchy;

    // Get root position from the root section
    const rootPosition = {
        x: parseFloat(skeleton.root.position[0]) || 0,
        y: parseFloat(skeleton.root.position[1]) || 0,
        z: parseFloat(skeleton.root.position[2]) || 0
    };

    function calculatePosition(boneName, parentPos) {
        const bone = bones[boneName];
        if (!bone) return;

        // Calculate the end position of this bone
        const position = {
            x: parentPos.x + (bone.direction.x * bone.length),
            y: parentPos.y + (bone.direction.y * bone.length),
            z: parentPos.z + (bone.direction.z * bone.length)
        };

        // Store the bone's start and end positions
        positions.set(boneName, {
            start: { ...parentPos },
            end: { ...position }
        });

        // Recursively calculate positions for children
        const children = hierarchy[boneName] || [];
        children.forEach(childName => {
            calculatePosition(childName, position);
        });
    }

    // Start from the first actual bone (hips) using root position
    if (hierarchy.root && hierarchy.root.length > 0) {
        hierarchy.root.forEach(rootChild => {
            calculatePosition(rootChild, rootPosition);
        });
    }

    return positions;
}

class SkeletonViewer {
    constructor(containerId, skeleton, bonePositions) {
        // Create container for the viewer
        this.container = document.getElementById(containerId);
        this.container.style.position = 'relative';

        // Create canvas
        this.canvas = document.createElement('canvas');
        this.canvas.width = 600;
        this.canvas.height = 600;
        this.canvas.style.border = '1px solid #ccc';

        // Create controls container
        this.controls = document.createElement('div');
        this.controls.style.marginBottom = '10px';

        // Create scale control
        const scaleControl = this.createControl(
            'Scale:',
            'range',
            { min: 1, max: 20, value: 10, step: 1 },
            (value) => {
                this.scale = Number(value);
                this.render();
            }
        );

        // Create rotation control
        const rotationControl = this.createControl(
            'Rotation Y:',
            'range',
            { min: -180, max: 180, value: 0, step: 1 },
            (value) => {
                this.rotationY = Number(value);
                this.render();
            }
        );

        // Add controls to container
        this.controls.appendChild(scaleControl);
        this.controls.appendChild(rotationControl);

        // Add elements to container
        this.container.appendChild(this.controls);
        this.container.appendChild(this.canvas);

        // Initialize properties
        this.ctx = this.canvas.getContext('2d');
        this.scale = 10;
        this.rotationY = 0;
        this.skeleton = skeleton;
        this.bonePositions = bonePositions;

        // Initial render
        this.render();
    }

    createControl(label, type, attributes, onChange) {
        const container = document.createElement('div');
        container.style.marginBottom = '5px';

        // Create label
        const labelElement = document.createElement('label');
        labelElement.textContent = label;
        labelElement.style.marginRight = '10px';

        // Create input
        const input = document.createElement('input');
        input.type = type;
        Object.entries(attributes).forEach(([key, value]) => {
            input[key] = value;
        });
        input.style.verticalAlign = 'middle';

        // Create value display
        const valueDisplay = document.createElement('span');
        valueDisplay.textContent = attributes.value + (label.includes('Scale') ? 'x' : '°');
        valueDisplay.style.marginLeft = '10px';

        // Add change listener
        input.addEventListener('input', (e) => {
            onChange(e.target.value);
            valueDisplay.textContent = e.target.value + (label.includes('Scale') ? 'x' : '°');
        });

        container.appendChild(labelElement);
        container.appendChild(input);
        container.appendChild(valueDisplay);

        return container;
    }

    rotateY(point, angle) {
        const rad = angle * Math.PI / 180;
        return {
            x: point.x * Math.cos(rad) + point.z * Math.sin(rad),
            y: point.y,
            z: -point.x * Math.sin(rad) + point.z * Math.cos(rad)
        };
    }

    render() {
        const width = this.canvas.width;
        const height = this.canvas.height;

        // Clear canvas
        this.ctx.fillStyle = 'white';
        this.ctx.fillRect(0, 0, width, height);

        // Set up coordinate system
        this.ctx.save();
        this.ctx.translate(width / 2, height / 2);
        this.ctx.scale(this.scale, -this.scale); // Flip Y axis

        // Draw bones
        this.ctx.strokeStyle = 'black';
        this.ctx.lineWidth = 1 / this.scale;

        this.bonePositions.forEach((positions, boneName) => {
            const { start, end } = positions;

            // Apply rotation
            const rotatedStart = this.rotateY(start, this.rotationY);
            const rotatedEnd = this.rotateY(end, this.rotationY);

            // Draw bone
            this.ctx.beginPath();
            this.ctx.moveTo(rotatedStart.x, rotatedStart.y);
            this.ctx.lineTo(rotatedEnd.x, rotatedEnd.y);
            this.ctx.stroke();

            // Draw joint
            this.ctx.beginPath();
            this.ctx.arc(rotatedStart.x, rotatedStart.y, 0.3, 0, Math.PI * 2);
            this.ctx.fillStyle = 'red';
            this.ctx.fill();
        });

        this.ctx.restore();
    }
}

/*
// Example usage:
function initSkeletonViewer(containerId, asfFileContent) {
    const parser = new ASFParser();
    const skeleton = parser.parse(asfFileContent);
    const bonePositions = calculateBonePositions(skeleton);

    return new SkeletonViewer(containerId, skeleton, bonePositions);
}

// Example usage:
function parseASFFile(content) {
    // Assuming you have the ASF file content in a variable called asfFileContent
    const viewer = initSkeletonViewer('skeleton-viewer', content);
}

*/

class AMCParser {
    constructor(skeleton) {
        this.skeleton = skeleton;
        this.frames = new Map(); // Map of frame number to motion data
    }

    parse(content) {
        const lines = content.split('\n').map(line => line.trim());
        let currentFrame = null;
        
        for (let line of lines) {
            console.log(line);
            // Skip empty lines, comments and metadata
            if (line === '' || line.startsWith('#') || line.startsWith(':')) continue;
            
            // Try to parse as frame number
            const frameNumber = parseInt(line);
            if (!isNaN(frameNumber)) {
                currentFrame = new Map();
                this.frames.set(frameNumber, currentFrame);
                continue;
            }
            
            // Parse bone data
            if (currentFrame) {
                const parts = line.split(/\s+/);
                const boneName = parts[0];
                const values = parts.slice(1).map(Number);
                currentFrame.set(boneName, values);
            }
        }
        
        return this.frames;
    }
}

class AnimatedSkeletonViewer extends SkeletonViewer {
    constructor(containerId, skeleton, bonePositions) {
        super(containerId, skeleton, bonePositions);
        
        this.currentFrame = 1;
        this.frames = null;
        this.isPlaying = false;
        this.animationSpeed = 30; // FPS
        
        // Add animation controls
        this.addAnimationControls();

        this.boneTransforms = new Map();
        this.precalculateTransforms();
    }
    
    // Matrix operations helpers
    degToRad(degrees) {
        return degrees * Math.PI / 180;
    }

    createRotationMatrixX(angle) {
        const rad = this.degToRad(angle);
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        return [
            1, 0, 0,
            0, cos, -sin,
            0, sin, cos
        ];
    }

    createRotationMatrixY(angle) {
        const rad = this.degToRad(angle);
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        return [
            cos, 0, sin,
            0, 1, 0,
            -sin, 0, cos
        ];
    }

    createRotationMatrixZ(angle) {
        const rad = this.degToRad(angle);
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        return [
            cos, -sin, 0,
            sin, cos, 0,
            0, 0, 1
        ];
    }

 

    multiplyMatrixVector(matrix, vector) {
        return {
            x: matrix[0]*vector.x + matrix[1]*vector.y + matrix[2]*vector.z,
            y: matrix[3]*vector.x + matrix[4]*vector.y + matrix[5]*vector.z,
            z: matrix[6]*vector.x + matrix[7]*vector.y + matrix[8]*vector.z
        };
    }

    getRotationMatrix(rx, ry, rz) {
        const matX = this.createRotationMatrixX(rx);
        const matY = this.createRotationMatrixY(ry);
        const matZ = this.createRotationMatrixZ(rz);
        
        // Apply rotations in Z, Y, X order (matches ASF axis order)
        return this.multiplyMatrices(
            this.multiplyMatrices(matX, matY),
            matZ
        );
    }

     // Matrix multiplication helper
     multiplyMatrices(a, b) {
        return [
            a[0]*b[0] + a[1]*b[3] + a[2]*b[6],
            a[0]*b[1] + a[1]*b[4] + a[2]*b[7],
            a[0]*b[2] + a[1]*b[5] + a[2]*b[8],
            a[3]*b[0] + a[4]*b[3] + a[5]*b[6],
            a[3]*b[1] + a[4]*b[4] + a[5]*b[7],
            a[3]*b[2] + a[4]*b[5] + a[5]*b[8],
            a[6]*b[0] + a[7]*b[3] + a[8]*b[6],
            a[6]*b[1] + a[7]*b[4] + a[8]*b[7],
            a[6]*b[2] + a[7]*b[5] + a[8]*b[8]
        ];
    }

    // Matrix inverse helper
    inverseMatrix(m) {
        const det = m[0] * (m[4] * m[8] - m[7] * m[5]) -
                   m[1] * (m[3] * m[8] - m[5] * m[6]) +
                   m[2] * (m[3] * m[7] - m[4] * m[6]);
        
        const invDet = 1 / det;
        
        return [
            (m[4] * m[8] - m[7] * m[5]) * invDet,
            (m[2] * m[7] - m[1] * m[8]) * invDet,
            (m[1] * m[5] - m[2] * m[4]) * invDet,
            (m[5] * m[6] - m[3] * m[8]) * invDet,
            (m[0] * m[8] - m[2] * m[6]) * invDet,
            (m[3] * m[2] - m[0] * m[5]) * invDet,
            (m[3] * m[7] - m[6] * m[4]) * invDet,
            (m[6] * m[1] - m[0] * m[7]) * invDet,
            (m[0] * m[4] - m[3] * m[1]) * invDet
        ];
    }

    createRotationMatrix(angle, axis) {
        const rad = angle * Math.PI / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        
        switch(axis.toLowerCase()) {
            case 'x':
                return [
                    1, 0, 0,
                    0, cos, -sin,
                    0, sin, cos
                ];
            case 'y':
                return [
                    cos, 0, sin,
                    0, 1, 0,
                    -sin, 0, cos
                ];
            case 'z':
                return [
                    cos, -sin, 0,
                    sin, cos, 0,
                    0, 0, 1
                ];
        }
    }

    precalculateTransforms() {
        const bones = this.skeleton.bones;
        
        for (const [boneName, bone] of Object.entries(bones)) {
            // For arms, we need to negate the forward direction
            let direction = { ...bone.direction };
            if (boneName.toLowerCase().includes('arm') || boneName.toLowerCase().includes('hand')) {
                direction.z = -direction.z; // Flip the forward direction for arms
            }
            
            if (!bone.axis) {
                this.boneTransforms.set(boneName, {
                    direction,
                    C: [1,0,0, 0,1,0, 0,0,1],
                    Cinv: [1,0,0, 0,1,0, 0,0,1],
                    B: [1,0,0, 0,1,0, 0,0,1]
                });
                continue;
            }
            
            // Create C matrix from axis angles using specified order
            let C = [1,0,0, 0,1,0, 0,0,1]; // Identity matrix
            const order = bone.axis.order.toLowerCase();
            
            for (let i = 0; i < order.length; i++) {
                const angle = bone.axis[order[i].toLowerCase()];
                const rotMatrix = this.createRotationMatrix(angle, order[i]);
                C = this.multiplyMatrices(C, rotMatrix);
            }
            
            const Cinv = this.inverseMatrix(C);
            const B = [1,0,0, 0,1,0, 0,0,1];
            
            this.boneTransforms.set(boneName, {
                direction,
                C,
                Cinv,
                B
            });
        }
    }
    
    addAnimationControls() {
        const animControls = document.createElement('div');
        animControls.style.marginTop = '10px';
        
        // Create play/pause button
        const playButton = document.createElement('button');
        playButton.textContent = 'Play';
        playButton.onclick = () => this.togglePlay();
        
        // Create frame slider
        const frameControl = this.createControl(
            'Frame:', 
            'range',
            { min: 1, max: 1, value: 1, step: 1 },
            (value) => {
                this.currentFrame = Number(value);
                this.updateSkeleton();
                this.render();
            }
        );
        
        // Create speed control
        const speedControl = this.createControl(
            'Speed:', 
            'range',
            { min: 1, max: 60, value: 30, step: 1 },
            (value) => {
                this.animationSpeed = Number(value);
                if (this.isPlaying) {
                    this.stopAnimation();
                    this.startAnimation();
                }
            }
        );
        
        animControls.appendChild(playButton);
        animControls.appendChild(frameControl);
        animControls.appendChild(speedControl);
        
        this.controls.appendChild(animControls);
        
        this.playButton = playButton;
        this.frameControl = frameControl.querySelector('input');
    }
    
    loadMotion(amcContent) {
        const parser = new AMCParser(this.skeleton);
        this.frames = parser.parse(amcContent);
        
        // Update frame slider max value
        this.frameControl.max = this.frames.size;
        
        // Initial update
        this.updateSkeleton();
        this.render();
    }
    
    updateSkeleton() {
        if (!this.frames || !this.frames.has(this.currentFrame)) return;
        
        const frameData = this.frames.get(this.currentFrame);
        this.bonePositions.clear();
        
        const rootData = frameData.get('root') || [0, 0, 0, 0, 0, 0];
        const rootPos = {
            x: rootData[0],
            y: rootData[1],
            z: rootData[2]
        };

        const updateBonePosition = (boneName, parentPos, parentTransform) => {
            const bone = this.skeleton.bones[boneName];
            if (!bone) return;

            const transforms = this.boneTransforms.get(boneName);
            if (!transforms) return;

            const motionData = frameData.get(boneName) || [];
            
            // Create motion matrix M from DOFs
            let M = [1,0,0, 0,1,0, 0,0,1];
            
            if (bone.dof && motionData.length > 0) {
                // Apply rotations in DOF order
                bone.dof.forEach((dof, index) => {
                    const angle = motionData[index] || 0;
                    const axis = dof[1];
                    const rotMatrix = this.createRotationMatrix(angle, axis);
                    M = this.multiplyMatrices(M, rotMatrix);
                });
            }

            // Calculate local transform L = Cinv * M * C * B
            let localTransform = this.multiplyMatrices(transforms.Cinv, M);
            localTransform = this.multiplyMatrices(localTransform, transforms.C);
            localTransform = this.multiplyMatrices(localTransform, transforms.B);
            
            // Combine with parent transform
            const globalTransform = parentTransform ? 
                this.multiplyMatrices(parentTransform, localTransform) : 
                localTransform;
            
            // Apply transform to bone's adjusted direction
            const direction = this.multiplyMatrixVector(globalTransform, transforms.direction);
            
            // Calculate end position
            const endPos = {
                x: parentPos.x + direction.x * bone.length,
                y: parentPos.y + direction.y * bone.length,
                z: parentPos.z + direction.z * bone.length
            };

            this.bonePositions.set(boneName, {
                start: { ...parentPos },
                end: { ...endPos }
            });

            // Process children
            const children = this.skeleton.hierarchy[boneName] || [];
            children.forEach(childName => {
                updateBonePosition(childName, endPos, globalTransform);
            });
        };

        // Start from root's children
        if (this.skeleton.hierarchy.root) {
            const rootTransform = [1,0,0, 0,1,0, 0,0,1];
            this.skeleton.hierarchy.root.forEach(rootChild => {
                updateBonePosition(rootChild, rootPos, rootTransform);
            });
        }
    }
    
    togglePlay() {
        if (this.isPlaying) {
            this.stopAnimation();
        } else {
            this.startAnimation();
        }
        this.playButton.textContent = this.isPlaying ? 'Pause' : 'Play';
    }
    
    startAnimation() {
        this.isPlaying = true;
        this.animate();
    }
    
    stopAnimation() {
        this.isPlaying = false;
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
        }
    }
    
    animate(timestamp) {
        if (!this.lastTimestamp) {
            this.lastTimestamp = timestamp;
        }
        
        const elapsed = timestamp - this.lastTimestamp;
        
        if (elapsed > (1000 / this.animationSpeed)) {
            this.currentFrame++;
            if (this.currentFrame > this.frames.size) {
                this.currentFrame = 1;
            }
            
            this.frameControl.value = this.currentFrame;
            this.updateSkeleton();
            this.render();
            
            this.lastTimestamp = timestamp;
        }
        
        if (this.isPlaying) {
            this.animationFrame = requestAnimationFrame((t) => this.animate(t));
        }
    }
}

// Example usage:
function initAnimatedSkeleton(containerId, asfContent, amcContent) {
    const parser = new ASFParser();
    const skeleton = parser.parse(asfContent);
    const bonePositions = calculateBonePositions(skeleton);
    
    const viewer = new AnimatedSkeletonViewer(containerId, skeleton, bonePositions);
    viewer.loadMotion(amcContent);
    
    return viewer;
}

// Modify handleASFFile to call drawDefaultPose
function handleASFFile(event) {

    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function (e) {
            asfContent = e.target.result;
            
        };
        reader.readAsText(file);
    }
}

// Modify handleASFFile to call drawDefaultPose
function handleAMCFile(event) {

    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function (e) {
            amcContent = e.target.result;
        };
        reader.readAsText(file);
    }
}


function handleStart(){
    console.log("starting...");
    initAnimatedSkeleton('skeleton-viewer', asfContent, amcContent);
} 

let asfContent;
let amcContent;

const asfFileInput = document.getElementById('asfFile');
asfFileInput.addEventListener('change', handleASFFile);
const amcFileInput = document.getElementById('amcFile');
amcFileInput.addEventListener('change', handleAMCFile);
const startInput = document.getElementById('start');
startInput.addEventListener('click', handleStart);