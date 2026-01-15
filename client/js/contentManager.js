/**
 * Content Manager Module
 * Handles loading, parsing, and displaying text content
 */
class ContentManager {
    constructor(containerId) {
        // Store the ID string
        this.containerId = containerId || 'content-container';
        this.paragraphs = [];
    }

    async processFile(file) {
        const text = await file.text();
        
        // 1. Split and filter lines starting with '>'
        this.paragraphs = text.split(/\r?\n/)
            .map(line => line.trim())
            .filter(line => line.startsWith('>'))
            .map(line => line.substring(1).trim())
            .filter(content => content.length > 0);

        // 2. Trigger the UI update immediately
        this.renderContent();
        
        // 3. Return the map for API synchronization
        return this.getContentMap();
    }

    renderContent() {
        // Use document.getElementById to find the element by the stored ID string
        const container = document.getElementById(this.containerId);
        
        if (!container) {
            console.error(`Content container with ID "${this.containerId}" not found!`);
            return;
        }

        // Use the local 'container' variable, not 'this.container'
        container.innerHTML = '<h1>Reading Session</h1>';

        this.paragraphs.forEach((text, index) => {
            const pId = `p${index + 1}`;
            const pElement = document.createElement('p');
            pElement.id = pId;
            pElement.textContent = text;
            
            // Append to the local container
            container.appendChild(pElement);
        });
        
        console.log(`UI Updated: ${this.paragraphs.length} paragraphs rendered.`);
        
        // Ensure the container is visible
        container.style.display = 'block';
    }

    getContentMap() {
        // Creates an object: { "p1": "text...", "p2": "text..." }
        const map = {};
        this.paragraphs.forEach((text, index) => {
            map[`p${index + 1}`] = text;
        });
        return map;
    }
}
